import { env } from '../../config/env';
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
import {
  isActiveTechnician,
  listActiveTechnicians,
  withTechnicianLifecycleLock,
  findUserById,
} from '../users';
import {
  TicketFilter,
  ticketsRepository as memory,
} from './tickets.repository';
import {
  postgresTicketsRepository as postgres,
} from './tickets.postgres.repository';
import {
  Ticket,
  TicketHistoryEntry,
  TicketStatus,
} from './tickets.types';

const useMemory = env.nodeEnv === 'test';

type HistoryInput = Omit<
  TicketHistoryEntry,
  'id' | 'createdAt' | 'ticketId'
>;

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  Open: ['Assigned'],
  Assigned: ['In Progress'],
  'In Progress': ['Resolved'],
  Resolved: ['In Progress', 'Closed'],
  Closed: [],
};

async function withTechnicianName(
  ticket: Ticket,
): Promise<Ticket> {
  const technician = ticket.assignedTechnicianId === null
    ? undefined
    : await findUserById(ticket.assignedTechnicianId);

  return {
    ...ticket,
    assignedTechnicianName: technician?.name ?? null,
  };
}

export async function getTicketForUser(
  id: number,
  user: AuthUser,
): Promise<Ticket> {
  const ticket = useMemory
    ? memory.findById(id)
    : await postgres.findById(id);

  if (!ticket || !canAccessTicket(ticket, user)) {
    throw Errors.notFound('Ticket');
  }

  // Evita modificar el registro en memoria antes de validar.
  return withTechnicianName(ticket);
}

async function saveWithHistory(
  ticket: Ticket,
  entries: HistoryInput[],
): Promise<Ticket> {
  if (!useMemory) {
    const saved = await postgres.saveWithHistory(
      ticket,
      ticket.version,
      entries,
    );

    return withTechnicianName(saved);
  }

  const current = memory.findById(ticket.id);

  if (!current || current.version !== ticket.version) {
    throw Errors.conflict(
      'El ticket cambió. Actualiza la información antes de guardar.',
    );
  }

  Object.assign(current, ticket, {
    version: current.version + 1,
  });

  memory.save(current);

  for (const entry of entries) {
    memory.addHistory({
      ...entry,
      ticketId: current.id,
    });
  }

   return withTechnicianName(current);
}

function mustBeAssignedTechnicianOrStaff(
  ticket: Ticket,
  user: AuthUser,
): void {
  const assigned = ticket.assignedTechnicianId === user.id;
  const staff = can(user, PERMISSIONS.TICKETS_READ_ALL);

  if (!assigned && !staff) throw Errors.forbidden();
}

function transition(
  ticket: Ticket,
  to: TicketStatus,
  user: AuthUser,
): HistoryInput {
  if (!TRANSITIONS[ticket.status].includes(to)) {
    throw Errors.invalidState(
      `A ticket cannot move from "${ticket.status}" to "${to}".`,
    );
  }

  const from = ticket.status;
  ticket.status = to;

  return {
    actorId: user.id,
    action: 'status_changed',
    from,
    to,
  };
}

function publishStatus(
  ticket: Ticket,
  entry: HistoryInput,
): void {
  recordAudit({
    action: 'ticket.status_changed',
    entity: 'ticket',
    entityId: ticket.id,
    actorId: entry.actorId,
    metadata: { from: entry.from, to: entry.to },
  });

  notify(
    ticket.createdBy,
    'ticket.status_changed',
    `Your ticket #${ticket.id} is now "${ticket.status}".`,
    { entity: 'ticket', id: ticket.id },
  );
}

export async function createTicket(
  data: {
    title: string;
    description: string;
    categoryId: number;
  },
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_CREATE)) {
    throw Errors.forbidden();
  }

  const input = { ...data, createdBy: user.id };
  const ticket = useMemory
    ? memory.create(input)
    : await postgres.create(input);

  if (useMemory) {
    memory.addHistory({
      ticketId: ticket.id,
      actorId: user.id,
      action: 'created',
      to: 'Open',
    });
  }

  recordAudit({
    action: 'ticket.created',
    entity: 'ticket',
    entityId: ticket.id,
    actorId: user.id,
  });

  return { ...ticket };
}

export async function listTickets(
  user: AuthUser,
  q: {
    status?: TicketStatus;
    priorityId?: number;
    categoryId?: number;
  },
): Promise<Ticket[]> {
  const filter: TicketFilter = { ...q, visibleTo: null };
  const tickets = useMemory
    ? memory.list(filter)
    : await postgres.list(filter);
  return Promise.all(
    tickets
      .filter(ticketVisibilityFilter(user))
      .map(withTechnicianName),
  );
}

export async function updateTicket(
  id: number,
  patch: {
    title?: string;
    description?: string;
    categoryId?: number;
  },
  user: AuthUser,
): Promise<Ticket> {
  const ticket = await getTicketForUser(id, user);

  const ownerEditing =
    ticket.createdBy === user.id && ticket.status === 'Open';

  const staffEditing =
    can(user, PERMISSIONS.TICKETS_UPDATE) &&
    can(user, PERMISSIONS.TICKETS_READ_ALL);

  if (!ownerEditing && !staffEditing) {
    throw Errors.forbidden();
  }

  Object.assign(ticket, patch);

  const saved = await saveWithHistory(ticket, [{
    actorId: user.id,
    action: 'updated',
    to: patch,
  }]);

  recordAudit({
    action: 'ticket.updated',
    entity: 'ticket',
    entityId: id,
    actorId: user.id,
  });

  return saved;
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

  const saved = await saveWithHistory(ticket, [{
    actorId: user.id,
    action: 'priority_changed',
    from,
    to: priorityId,
  }]);

  recordAudit({
    action: 'ticket.priority_changed',
    entity: 'ticket',
    entityId: id,
    actorId: user.id,
    metadata: { from, to: priorityId },
  });

  return saved;
}

export async function assignTechnician(
  id: number,
  technicianId: number,
  dueDate: string | undefined,
  user: AuthUser,
  options: {
    expectedVersion: number;
    reason?: string;
  },
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_ASSIGN)) {
    throw Errors.forbidden(
      'Only service advisors can assign tickets.',
    );
  }

  return withTechnicianLifecycleLock(
    technicianId,
    async () => {
      if (!(await isActiveTechnician(technicianId))) {
        throw Errors.validation([
          {
            field: 'technicianId',
            message: 'The user is not an active technician.',
          },
        ]);
      }

      const ticket = await getTicketForUser(id, user);

      if (ticket.version !== options.expectedVersion) {
        throw Errors.conflict(
          'El ticket cambió. Actualiza la información antes de asignar.',
        );
      }

      if (
        ticket.status !== 'Open' &&
        ticket.status !== 'Assigned'
      ) {
        throw Errors.invalidState(
          `A ticket in status "${ticket.status}" cannot be (re)assigned.`,
        );
      }
      if (
        dueDate !== undefined &&
        (
          ticket.dueDate === null ||
          new Date(dueDate).getTime() !==
            new Date(ticket.dueDate).getTime()
        )
      ) {
        throw Errors.validation([
          {
            field: 'dueDate',
            message:
              'La asignación no permite modificar el plazo del ticket.',
          },
        ]);
      }

      if (ticket.assignedTechnicianId === technicianId) {
        return ticket;
      }

      const from = ticket.assignedTechnicianId;
      const entries: HistoryInput[] = [];

      ticket.assignedTechnicianId = technicianId;

      if (ticket.status === 'Open') {
        entries.push(
          transition(ticket, 'Assigned', user),
        );
      }

      entries.push({
        actorId: user.id,
        action: 'assigned',
        from,
        to: technicianId,
        reason: options.reason ?? null,
      });

      const saved = await saveWithHistory(ticket, entries);

      for (const entry of entries) {
        if (entry.action === 'status_changed') {
          publishStatus(saved, entry);
        }
      }

      recordAudit({
        action: 'ticket.assigned',
        entity: 'ticket',
        entityId: id,
        actorId: user.id,
        metadata: {
          from,
          to: technicianId,
          reason: options.reason ?? null,
        },
      });

      notify(
        technicianId,
        'ticket.assigned',
        `Ticket #${id} was assigned to you.`,
        { entity: 'ticket', id },
      );

      return saved;
    },
  );
}
export async function changeStatus(
  id: number,
  to: TicketStatus,
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_STATUS_UPDATE)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);

  if (
    to === 'Assigned' ||
    to === 'Resolved' ||
    to === 'Closed'
  ) {
    throw Errors.validation([
      {
        field: 'status',
        message:
          `Use the dedicated endpoint for "${to}" (assignment / resolution / close).`,
      },
    ]);
  }

  const entry = transition(ticket, to, user);
  const saved = await saveWithHistory(ticket, [entry]);

  publishStatus(saved, entry);
  return saved;
}

export async function resolveTicket(
  id: number,
  resolution: string,
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_RESOLVE)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);

  const entry = transition(ticket, 'Resolved', user);

  ticket.resolution = resolution;
  ticket.resolvedAt = new Date().toISOString();

  const saved = await saveWithHistory(ticket, [entry]);

  publishStatus(saved, entry);
  return saved;
}

export async function closeTicket(
  id: number,
  comment: string | undefined,
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_CLOSE)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);

  const entry = transition(ticket, 'Closed', user);
  ticket.closedAt = new Date().toISOString();

  const entries: HistoryInput[] = [entry];

  if (comment) {
    entries.push({
      actorId: user.id,
      action: 'closed_comment',
      to: comment,
    });
  }

  const saved = await saveWithHistory(ticket, entries);

  publishStatus(saved, entry);
  return saved;
}

export async function ticketHistory(
  id: number,
  user: AuthUser,
): Promise<TicketHistoryEntry[]> {
  await getTicketForUser(id, user);

  return useMemory
    ? memory.historyOf(id)
    : postgres.historyOf(id);
}

export async function eligibleTechnicians(
  id: number,
  user: AuthUser,
): Promise<{ id: number; name: string }[]> {
  if (!can(user, PERMISSIONS.TICKETS_ASSIGN)) {
    throw Errors.forbidden(
      'Only service advisors can assign tickets.',
    );
  }

  const ticket = await getTicketForUser(id, user);

  if (
    ticket.status !== 'Open' &&
    ticket.status !== 'Assigned'
  ) {
    throw Errors.invalidState(
      `A ticket in status "${ticket.status}" cannot be (re)assigned.`,
    );
  }

  return listActiveTechnicians();
}