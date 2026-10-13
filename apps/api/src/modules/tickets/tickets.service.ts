import { Errors } from '../../shared/errors';
import { AuthUser, hasRole } from '../../shared/types';
import { recordAudit } from '../audit';
import { notify } from '../notifications';
import { isActiveTechnician } from '../users';
import { TicketFilter, ticketsRepository as repo } from './tickets.repository';
import { Ticket, TicketStatus } from './tickets.types';

/** Máquina de estados del ticket (provisional, ver tickets.types.ts). */
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  Open: ['Assigned'],
  Assigned: ['In Progress'],
  'In Progress': ['Resolved'],
  Resolved: ['In Progress', 'Closed'],
  Closed: [],
};

const isStaff = (u: AuthUser) => hasRole(u, 'Service Advisor', 'Manager');

function canView(ticket: Ticket, user: AuthUser): boolean {
  return (
    isStaff(user) ||
    ticket.createdBy === user.id ||
    (hasRole(user, 'Technician') && ticket.assignedTechnicianId === user.id)
  );
}

/** Obtiene un ticket verificando que el usuario tenga permiso de verlo (RBAC + propiedad). */
export function getTicketForUser(id: number, user: AuthUser): Ticket {
  const ticket = repo.findById(id);
  // 404 (no 403) para no revelar que existe un ticket ajeno.
  if (!ticket || !canView(ticket, user)) throw Errors.notFound('Ticket');
  return ticket;
}

function mustBeAssignedTechnicianOrStaff(ticket: Ticket, user: AuthUser) {
  const isAssignedTech = hasRole(user, 'Technician') && ticket.assignedTechnicianId === user.id;
  if (!isAssignedTech && !isStaff(user)) throw Errors.forbidden();
}

function moveTo(ticket: Ticket, to: TicketStatus, user: AuthUser): void {
  if (!TRANSITIONS[ticket.status].includes(to)) {
    throw Errors.invalidState(`A ticket cannot move from "${ticket.status}" to "${to}".`);
  }
  const from = ticket.status;
  ticket.status = to;
  repo.save(ticket);
  repo.addHistory({ ticketId: ticket.id, actorId: user.id, action: 'status_changed', from, to });
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

export function createTicket(
  data: { title: string; description: string; categoryId: number },
  user: AuthUser,
): Ticket {
  if (!hasRole(user, 'Employee', 'Service Advisor')) throw Errors.forbidden();
  const ticket = repo.create({ ...data, createdBy: user.id });
  repo.addHistory({ ticketId: ticket.id, actorId: user.id, action: 'created', to: 'Open' });
  recordAudit({ action: 'ticket.created', entity: 'ticket', entityId: ticket.id, actorId: user.id });
  return ticket;
}

export function listTickets(
  user: AuthUser,
  q: { status?: TicketStatus; priorityId?: number; categoryId?: number },
): Ticket[] {
  const filter: TicketFilter = { ...q, visibleTo: isStaff(user) ? null : user.id };
  return repo.list(filter);
}

export function updateTicket(
  id: number,
  patch: { title?: string; description?: string; categoryId?: number },
  user: AuthUser,
): Ticket {
  const ticket = getTicketForUser(id, user);
  const ownerEditing = ticket.createdBy === user.id && ticket.status === 'Open';
  if (!ownerEditing && !isStaff(user)) throw Errors.forbidden();
  Object.assign(ticket, patch);
  repo.save(ticket);
  repo.addHistory({ ticketId: id, actorId: user.id, action: 'updated', to: patch });
  recordAudit({ action: 'ticket.updated', entity: 'ticket', entityId: id, actorId: user.id });
  return ticket;
}

export function setPriority(id: number, priorityId: number, user: AuthUser): Ticket {
  if (!hasRole(user, 'Manager')) throw Errors.forbidden('Only managers can set the priority.');
  const ticket = getTicketForUser(id, user);
  const from = ticket.priorityId;
  ticket.priorityId = priorityId;
  repo.save(ticket);
  repo.addHistory({ ticketId: id, actorId: user.id, action: 'priority_changed', from, to: priorityId });
  recordAudit({
    action: 'ticket.priority_changed',
    entity: 'ticket',
    entityId: id,
    actorId: user.id,
    metadata: { from, to: priorityId },
  });
  return ticket;
}

export function assignTechnician(
  id: number,
  technicianId: number,
  dueDate: string | undefined,
  user: AuthUser,
): Ticket {
  if (!isStaff(user)) throw Errors.forbidden('Only service advisors or managers can assign tickets.');
  const ticket = getTicketForUser(id, user);
  if (ticket.status !== 'Open' && ticket.status !== 'Assigned') {
    throw Errors.invalidState(`A ticket in status "${ticket.status}" cannot be (re)assigned.`);
  }
  if (!isActiveTechnician(technicianId)) {
    throw Errors.validation([{ field: 'technicianId', message: 'The user is not an active technician.' }]);
  }
  const from = ticket.assignedTechnicianId;
  ticket.assignedTechnicianId = technicianId;
  ticket.dueDate = dueDate ?? ticket.dueDate;
  const wasOpen = ticket.status === 'Open';
  if (wasOpen) {
    moveTo(ticket, 'Assigned', user);
  } else {
    repo.save(ticket);
  }
  repo.addHistory({ ticketId: id, actorId: user.id, action: 'assigned', from, to: technicianId });
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

export function changeStatus(id: number, to: TicketStatus, user: AuthUser): Ticket {
  const ticket = getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);
  if (to === 'Assigned' || to === 'Resolved' || to === 'Closed') {
    throw Errors.validation([
      {
        field: 'status',
        message: `Use the dedicated endpoint for "${to}" (assignment / resolution / close).`,
      },
    ]);
  }
  moveTo(ticket, to, user);
  return ticket;
}

export function resolveTicket(id: number, resolution: string, user: AuthUser): Ticket {
  const ticket = getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);
  moveTo(ticket, 'Resolved', user);
  ticket.resolution = resolution;
  ticket.resolvedAt = new Date().toISOString();
  repo.save(ticket);
  return ticket;
}

export function closeTicket(id: number, comment: string | undefined, user: AuthUser): Ticket {
  const ticket = getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);
  moveTo(ticket, 'Closed', user);
  ticket.closedAt = new Date().toISOString();
  repo.save(ticket);
  if (comment) repo.addHistory({ ticketId: id, actorId: user.id, action: 'closed_comment', to: comment });
  return ticket;
}

export function ticketHistory(id: number, user: AuthUser) {
  getTicketForUser(id, user);
  return repo.historyOf(id);
}
