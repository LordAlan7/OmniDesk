import { Errors } from '../../shared/errors';
import { AuthUser } from '../../shared/types';
import {
  PERMISSIONS,
  can,
  canAccessTicket,
  ticketVisibilityFilter,
} from '../../shared/authorization';
import { recordAudit } from '../audit';
import { notify } from '../notifications';
import { isActiveTechnician } from '../users';
import {
  TicketFilter,
  ticketsRepository as repo,
} from './tickets.repository';
import { Ticket, TicketStatus } from './tickets.types';
import { assertStatusInvariants, canReclassify } from './tickets.lifecycle';

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  Open: ['Assigned'],
  Assigned: ['In Progress'],
  'In Progress': ['Resolved'],
  Resolved: ['In Progress', 'Closed'],
  Closed: [],
};

export async function getTicketForUser(
  id: number,
  user: AuthUser,
): Promise<Ticket> {
  const ticket = await repo.findById(id);
  if (!ticket || !canAccessTicket(ticket, user)) throw Errors.notFound('Ticket');
  return ticket;
}

function mustBeAssignedTechnicianOrStaff(ticket: Ticket, user: AuthUser) {
  const isAssignedTech = ticket.assignedTechnicianId === user.id;
  const isStaff = can(user, PERMISSIONS.TICKETS_READ_ALL);
  if (!isAssignedTech && !isStaff) throw Errors.forbidden();
}

async function moveTo(
  ticket: Ticket,
  to: TicketStatus,
  user: AuthUser,
): Promise<void> {
  if (!TRANSITIONS[ticket.status].includes(to)) {
    throw Errors.invalidState(
      `A ticket cannot move from "${ticket.status}" to "${to}".`,
    );
  }
  const from = ticket.status;
  ticket.status = to;
  
  // Valida coherencia antes de guardar (NFR-010)
  assertStatusInvariants(ticket); 
  
  const saved = await repo.save(ticket);
  Object.assign(ticket, saved); // Actualiza version desde el repo
  
  await repo.addHistory({
    ticketId: ticket.id,
    actorId: user.id,
    action: 'status_changed',
    from,
    to,
  });
  recordAudit({
    action: 'ticket.status_changed',
    entity: 'ticket',
    entityId: ticket.id,
    actorId: user.id,
    metadata: { from, to },
  });
  notify(ticket.createdBy, 'ticket.status_changed', `Your ticket #${ticket.id} is now "${to}".`, {
    entity: 'ticket',
    id: ticket.id,
  });
}

export async function createTicket(
  data: { title: string; description: string; categoryId: number },
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_CREATE)) throw Errors.forbidden();
  const ticket = await repo.create({ ...data, createdBy: user.id });
  await repo.addHistory({
    ticketId: ticket.id,
    actorId: user.id,
    action: 'created',
    to: 'Open',
  });
  recordAudit({
    action: 'ticket.created',
    entity: 'ticket',
    entityId: ticket.id,
    actorId: user.id,
  });
  return ticket;
}

export async function listTickets(
  user: AuthUser,
  q: { status?: TicketStatus; priorityId?: number; categoryId?: number },
): Promise<Ticket[]> {
  const filter: TicketFilter = { ...q, visibleTo: null };
  const all = await repo.list(filter);
  return all.filter(ticketVisibilityFilter(user));
}

export async function updateTicket(
  id: number,
  patch: {
    title?: string;
    description?: string;
    categoryId?: number;
    version: number;
  },
  user: AuthUser,
): Promise<Ticket> {
  const ticket = await getTicketForUser(id, user);

  const ownerEditing = ticket.createdBy === user.id && ticket.status === 'Open';
  const staffEditing =
    can(user, PERMISSIONS.TICKETS_UPDATE) && can(user, PERMISSIONS.TICKETS_READ_ALL);
  if (!ownerEditing && !staffEditing) throw Errors.forbidden();

  // Versionado optimista: detecta si otro usuario ya modificó el ticket.
  if (ticket.version !== patch.version) {
    throw Errors.conflict(
      'El ticket fue modificado por otro usuario. Recarga la página e intenta de nuevo.',
    );
  }

  if (patch.title !== undefined) ticket.title = patch.title;
  if (patch.description !== undefined) ticket.description = patch.description;
  if (patch.categoryId !== undefined) ticket.categoryId = patch.categoryId;

  const saved = await repo.save(ticket);
  Object.assign(ticket, saved);
  await repo.addHistory({
    ticketId: id,
    actorId: user.id,
    action: 'updated',
    to: {
      title: patch.title,
      description: patch.description,
      categoryId: patch.categoryId,
    },
  });
  recordAudit({
    action: 'ticket.updated',
    entity: 'ticket',
    entityId: id,
    actorId: user.id,
  });
  return ticket;
}

export async function setPriority(
  id: number,
  priorityId: number,
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_PRIORITY_UPDATE)) {
    throw Errors.forbidden('Only managers can set the priority.');
  }
  const ticket = await getTicketForUser(id, user);
  const from = ticket.priorityId;
  ticket.priorityId = priorityId;
  const saved = await repo.save(ticket);
  Object.assign(ticket, saved);
  await repo.addHistory({
    ticketId: id,
    actorId: user.id,
    action: 'priority_changed',
    from,
    to: priorityId,
  });
  recordAudit({
    action: 'ticket.priority_changed',
    entity: 'ticket',
    entityId: id,
    actorId: user.id,
    metadata: { from, to: priorityId },
  });
  return ticket;
}

export async function assignTechnician(
  id: number,
  technicianId: number,
  dueDate: string | undefined,
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_ASSIGN)) {
    throw Errors.forbidden('Only service advisors can assign tickets.');
  }
  const ticket = await getTicketForUser(id, user);
  if (ticket.status !== 'Open' && ticket.status !== 'Assigned') {
    throw Errors.invalidState(
      `A ticket in status "${ticket.status}" cannot be (re)assigned.`,
    );
  }

  // AQUÍ ESTÁ EL FIX (agregamos el await porque ahora es asíncrono):
  if (!(await isActiveTechnician(technicianId))) {
    throw Errors.validation([
      { field: 'technicianId', message: 'The user is not an active technician.' },
    ]);
  }

  const from = ticket.assignedTechnicianId;
  ticket.assignedTechnicianId = technicianId;
  ticket.dueDate = dueDate ?? ticket.dueDate;

  if (ticket.status === 'Open') {
    // moveTo maneja save + history + audit + notify.
    await moveTo(ticket, 'Assigned', user);
  } else {
    const saved = await repo.save(ticket);
    Object.assign(ticket, saved);
  }

  await repo.addHistory({
    ticketId: id,
    actorId: user.id,
    action: 'assigned',
    from,
    to: technicianId,
  });
  recordAudit({
    action: 'ticket.assigned',
    entity: 'ticket',
    entityId: id,
    actorId: user.id,
    metadata: { from, to: technicianId },
  });
  notify(technicianId, 'ticket.assigned', `Ticket #${id} was assigned to you.`, {
    entity: 'ticket',
    id,
  });
  return ticket;
}

export async function changeStatus(
  id: number,
  to: TicketStatus,
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_STATUS_UPDATE)) throw Errors.forbidden();
  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);
  if (to === 'Assigned' || to === 'Resolved' || to === 'Closed') {
    throw Errors.validation([
      {
        field: 'status',
        message: `Use the dedicated endpoint for "${to}" (assignment / resolution / close).`,
      },
    ]);
  }
  await moveTo(ticket, to, user);
  return ticket;
}

export async function resolveTicket(
  id: number,
  resolution: string,
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_RESOLVE)) throw Errors.forbidden();
  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);
  ticket.resolution = resolution;
  ticket.resolvedAt = new Date().toISOString();
  await moveTo(ticket, 'Resolved', user);
  return ticket;
}

export async function closeTicket(
  id: number,
  comment: string | undefined,
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_CLOSE)) throw Errors.forbidden();
  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);
  ticket.closedAt = new Date().toISOString();
  await moveTo(ticket, 'Closed', user);
  if (comment) {
    await repo.addHistory({
      ticketId: id,
      actorId: user.id,
      action: 'closed_comment',
      to: comment,
    });
  }
  return ticket;
}

export async function ticketHistory(
  id: number,
  user: AuthUser,
): Promise<Awaited<ReturnType<typeof repo.historyOf>>> {
  await getTicketForUser(id, user);
  return repo.historyOf(id);
}

export async function updateCategory(
  id: number,
  categoryId: number,
  user: AuthUser,
): Promise<Ticket> {
  // Solo Service Advisor y Manager pueden reclasificar (NFR-001)
  if (!can(user, PERMISSIONS.TICKETS_UPDATE) || !can(user, PERMISSIONS.TICKETS_READ_ALL)) {
    throw Errors.forbidden('Solo asesores y gerentes pueden reclasificar tickets.');
  }

  const ticket = await getTicketForUser(id, user);
  canReclassify(ticket); // Valida que no esté cerrado

  if (ticket.categoryId === categoryId) {
    return ticket; // No hay cambio, no registramos historial
  }

  const from = ticket.categoryId;
  ticket.categoryId = categoryId;

  const saved = await repo.save(ticket);
  Object.assign(ticket, saved);

  await repo.addHistory({
    ticketId: id,
    actorId: user.id,
    action: 'category_changed',
    from,
    to: categoryId,
  });

  recordAudit({
    action: 'ticket.category_changed',
    entity: 'ticket',
    entityId: id,
    actorId: user.id,
    metadata: { from, to: categoryId },
  });

  return ticket;
}