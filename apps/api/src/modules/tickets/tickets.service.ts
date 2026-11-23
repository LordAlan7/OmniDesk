import type { AiCreationApproval } from '../../shared/db/ai-validation';

import { publicUpdates, canReadInternalHistory } from './tickets.tracking';
import { canReclassify, resolveApprovedArticleReference } from './tickets.lifecycle';
import { TRANSITIONS, availableTransitions, isOverdue } from './tickets.deadline';
import { Errors } from '../../shared/errors';
import { AuthUser } from '../../shared/types';
import { recordAudit } from '../audit';
import { getArticle } from '../knowledge';
import type { AiApplicationApproval } from '../../shared/db/ai-validation';
import {
  PERMISSIONS,
  can,
  canAccessTicket,
  ticketVisibilityFilter,
} from '../../shared/authorization';
import {
  isActiveTechnician,
  listActiveTechnicians,
  withTechnicianLifecycleLock,
  findUserById,
} from '../users';
import { TicketFilter, ticketsRepository } from './tickets.repository';
import {
  Ticket,
  TicketHistoryEntry,
  TicketInvestigation,
  TicketStatus,
} from './tickets.types';

// NFR-008: Caché local de idempotencia.
const creations = new Map<
  string,
  { fingerprint: string; result: Promise<Ticket> }
>();

export async function listCategories() {
  return ticketsRepository.listCategories();
}

export async function listPriorities() {
  return ticketsRepository.listPriorities();
}

type HistoryInput = Omit<
  TicketHistoryEntry,
  'id' | 'createdAt' | 'ticketId'
>;

async function withTechnicianName(ticket: Ticket): Promise<Ticket> {
  const technician =
    ticket.assignedTechnicianId === null
      ? undefined
      : await findUserById(ticket.assignedTechnicianId);

  return {
    ...ticket,
    assignedTechnicianName: technician?.name ?? null,
    isOverdue: isOverdue(ticket),
  };
}

export async function getTicketForUser(
  id: number,
  user: AuthUser,
): Promise<Ticket> {
  const ticket = await ticketsRepository.findById(id);

  if (!ticket || !canAccessTicket(ticket, user)) {
    throw Errors.notFound('Ticket');
  }

  return withTechnicianName(ticket);
}

async function saveWithHistory(
  ticket: Ticket,
  entries: HistoryInput[],
  saveContext?: {
    actorId: number;
    previousAssigneeId: number | null;
  },
  aiValidation?: AiApplicationApproval,
): Promise<Ticket> {
  const saved = await ticketsRepository.saveWithHistory(
    ticket,
    ticket.version,
    entries,
    saveContext,
    aiValidation,
  );

  return withTechnicianName(saved);
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
  action: string = 'status_changed',
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
    action,
    from,
    to,
  };
}

// FR-020: Las notificaciones se gestionan en el repositorio.
function publishStatus(
  _ticket: Ticket,
  _entry: HistoryInput,
): void {
  // No-op.
}

export async function createTicket(
  data: {
    title: string;
    description: string;
    categoryId: number;
    storeLocation: string;
    motorcycleModel: string;
  },
  user: AuthUser,
  idempotencyKey?: string,
  aiValidation?: AiCreationApproval,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_CREATE)) {
    throw Errors.forbidden();
  }

  const key = idempotencyKey
    ? `${user.id}:${idempotencyKey}`
    : undefined;

  const fingerprint = JSON.stringify(data);
  const cached = key ? creations.get(key) : undefined;

  if (cached) {
    if (cached.fingerprint !== fingerprint) {
      throw Errors.conflict(
        'La clave de idempotencia ya se usó con otros datos.',
      );
    }

    return { ...(await cached.result) };
  }

  const input = {
    ...data,
    storeLocation: data.storeLocation ?? null,
    motorcycleModel: data.motorcycleModel ?? null,
    createdBy: user.id,
  };

  const result = ticketsRepository.create(input, aiValidation);

  if (key) creations.set(key, { fingerprint, result });

  let ticket: Ticket;

  try {
    ticket = await result;
  } catch (cause) {
    if (key) creations.delete(key);
    throw cause;
  }

  return { ...ticket };
}

export async function listTickets(
  user: AuthUser,
  q: {
    status?: TicketStatus;
    priorityId?: number;
    categoryId?: number;
    overdue?: boolean;
  },
): Promise<Ticket[]> {
  const { overdue, ...rest } = q;
  const filter: TicketFilter = { ...rest, visibleTo: null };
  const tickets = await ticketsRepository.list(filter);

  return Promise.all(
    tickets
      .filter(ticketVisibilityFilter(user))
      .filter(
        (t) => overdue === undefined || isOverdue(t) === overdue,
      )
      .map(withTechnicianName),
  );
}

export async function setPriority(
  id: number,
  priorityId: number,
  user: AuthUser,
  options: {
    expectedVersion: number;
    reason?: string;
  },
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_PRIORITY_UPDATE)) {
    throw Errors.forbidden('Only managers can set the priority.');
  }

  const ticket = await getTicketForUser(id, user);

  if (ticket.status === 'Closed') {
    throw Errors.invalidState(
      'No se puede cambiar la prioridad de un ticket cerrado.',
    );
  }

  if (ticket.version !== options.expectedVersion) {
    throw Errors.conflict(
      'El ticket cambió. Actualiza la información antes de guardar.',
    );
  }

  if (ticket.priorityId === priorityId) {
    return ticket;
  }

  const from = ticket.priorityId;
  ticket.priorityId = priorityId;

  return saveWithHistory(ticket, [
    {
      actorId: user.id,
      action: 'priority_changed',
      from,
      to: priorityId,
      reason: options.reason ?? null,
    },
  ]);
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
        (ticket.dueDate === null ||
          new Date(dueDate).getTime() !==
            new Date(ticket.dueDate).getTime())
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

      const previousAssigneeId = ticket.assignedTechnicianId;
      const from = ticket.assignedTechnicianId;
      const entries: HistoryInput[] = [];

      ticket.assignedTechnicianId = technicianId;

      if (ticket.status === 'Open') {
        entries.push(transition(ticket, 'Assigned', user));
      }

      entries.push({
        actorId: user.id,
        action: 'assigned',
        from,
        to: technicianId,
        reason: options.reason ?? null,
      });

      const saved = await saveWithHistory(ticket, entries, {
        actorId: user.id,
        previousAssigneeId,
      });

      for (const entry of entries) {
        if (entry.action === 'status_changed') {
          publishStatus(saved, entry);
        }
      }

      return saved;
    },
  );
}

export async function changeStatus(
  id: number,
  to: TicketStatus,
  user: AuthUser,
  expectedVersion?: number,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_STATUS_UPDATE)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);

  if (
    expectedVersion !== undefined &&
    ticket.version !== expectedVersion
  ) {
    throw Errors.conflict(
      'El ticket cambió. Actualiza la información antes de cambiar el estado.',
    );
  }

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

  const saved = await saveWithHistory(ticket, [entry], {
    actorId: user.id,
    previousAssigneeId: ticket.assignedTechnicianId,
  });

  publishStatus(saved, entry);

  return saved;
}

export async function resolveTicket(
  id: number,
  input: {
    resolution: string;
    resolutionVerification: string;
    rootCause?: string;
    observations?: string;
    knowledgeArticleId?: number;
  },
  user: AuthUser,
  expectedVersion?: number,
  aiValidation?: AiApplicationApproval,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_RESOLVE)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);

  if (
    expectedVersion !== undefined &&
    ticket.version !== expectedVersion
  ) {
    throw Errors.conflict(
      'La version del ticket cambio. Actualiza el ticket antes de aplicar la recomendacion.',
    );
  }

  if (input.knowledgeArticleId !== undefined) {
    const article = await resolveApprovedArticleReference(
      input.knowledgeArticleId,
    );
    ticket.knowledgeArticleId = article ? article.id : null;
  } else {
    ticket.knowledgeArticleId = null;
  }

  const entry = transition(ticket, 'Resolved', user);

  ticket.resolution = input.resolution;
  ticket.resolutionVerification = input.resolutionVerification;
  ticket.rootCause = input.rootCause ? input.rootCause : null;
  ticket.resolutionObservations = input.observations
    ? input.observations
    : null;
  ticket.resolvedAt = new Date().toISOString();

  const saved = await saveWithHistory(
    ticket,
    [entry],
    {
      actorId: user.id,
      previousAssigneeId: ticket.assignedTechnicianId,
    },
    aiValidation,
  );

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

export async function reopenTicket(
  id: number,
  reason: string,
  expectedVersion: number,
  user: AuthUser,
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_STATUS_UPDATE)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);

  if (ticket.status !== 'Resolved') {
    throw Errors.invalidState(
      'Solo se puede reabrir un ticket que esté en estado "Resolved".',
    );
  }

  if (ticket.version !== expectedVersion) {
    throw Errors.conflict(
      'El ticket cambió. Actualiza la información antes de reabrir.',
    );
  }

  const entry = transition(
    ticket,
    'In Progress',
    user,
    'reopened',
  );

  entry.reason = reason;

  // Conservar resolución histórica al reabrir.
  const saved = await saveWithHistory(ticket, [entry]);
  publishStatus(saved, entry);

  return saved;
}

export async function addInvestigation(
  id: number,
  input: {
    activity: string;
    result: string;
    knowledgeArticleId?: number;
  },
  user: AuthUser,
  aiValidation?: AiApplicationApproval,
): Promise<TicketInvestigation> {
  if (!can(user, PERMISSIONS.TICKETS_UPDATE)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);

  if (ticket.status === 'Closed') {
    throw Errors.invalidState(
      'No se pueden registrar investigaciones en un ticket cerrado.',
    );
  }

  let knowledgeArticleId: number | null = null;

  if (input.knowledgeArticleId !== undefined) {
    const article = await resolveApprovedArticleReference(
      input.knowledgeArticleId,
    );
    knowledgeArticleId = article ? article.id : null;
  }

  return ticketsRepository.addInvestigation({
    ticketId: id,
    authorId: user.id,
    activity: input.activity,
    result: input.result,
    knowledgeArticleId,
    aiValidation,
  });
}

export async function listInvestigations(
  id: number,
  user: AuthUser,
): Promise<TicketInvestigation[]> {
  if (!can(user, PERMISSIONS.TICKETS_READ)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);

  const assigned = ticket.assignedTechnicianId === user.id;
  const staff = can(user, PERMISSIONS.TICKETS_READ_ALL);

  if (!assigned && !staff) {
    return [];
  }

  return ticketsRepository.listInvestigations(id);
}

export async function ticketHistory(
  id: number,
  user: AuthUser,
) {
  const ticket = await getTicketForUser(id, user);
  const entries = await ticketsRepository.historyOf(id);

  if (!canReadInternalHistory(ticket, user)) {
    return publicUpdates(entries);
  }

  const names = new Map<number, string | null>();

  for (
    const actorId of new Set(
      entries.map((entry) => entry.actorId),
    )
  ) {
    names.set(
      actorId,
      (await findUserById(actorId))?.name ?? null,
    );
  }

  return entries.map((entry) => ({
    ...entry,
    actorName: names.get(entry.actorId) ?? null,
  }));
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

export async function updateCategory(
  id: number,
  categoryId: number,
  user: AuthUser,
): Promise<Ticket> {
  if (
    !user.roles.some(
      (role) =>
        role === 'Service Advisor' || role === 'Manager',
    )
  ) {
    throw Errors.forbidden(
      'Solo asesores y gerentes pueden reclasificar tickets.',
    );
  }

  const ticket = await getTicketForUser(id, user);
  canReclassify(ticket);

  if (ticket.categoryId === categoryId) {
    return ticket;
  }

  const from = ticket.categoryId;
  ticket.categoryId = categoryId;

  return saveWithHistory(ticket, [
    {
      actorId: user.id,
      action: 'category_changed',
      from,
      to: categoryId,
    },
  ]);
}

export async function updateBusinessInfo(
  id: number,
  patch: {
    storeLocation?: string;
    motorcycleModel?: string;
    version: number;
  },
  user: AuthUser,
): Promise<Ticket> {
  const ticket = await getTicketForUser(id, user);

  const canEdit = user.roles.some(
    (role) =>
      role === 'Service Advisor' || role === 'Manager',
  );

  if (!canEdit) throw Errors.forbidden();

  if (ticket.status === 'Closed') {
    throw Errors.invalidState(
      'No se puede editar la información comercial de un ticket cerrado.',
    );
  }

  if (ticket.version !== patch.version) {
    throw Errors.conflict(
      'El ticket fue modificado por otro usuario.',
    );
  }

  const from = {
    storeLocation: ticket.storeLocation,
    motorcycleModel: ticket.motorcycleModel,
  };

  if (patch.storeLocation !== undefined) {
    ticket.storeLocation = patch.storeLocation;
  }

  if (patch.motorcycleModel !== undefined) {
    ticket.motorcycleModel = patch.motorcycleModel;
  }

  return saveWithHistory(ticket, [
    {
      actorId: user.id,
      action: 'business_info_updated',
      from,
      to: {
        storeLocation: ticket.storeLocation,
        motorcycleModel: ticket.motorcycleModel,
      },
    },
  ]);
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

  const ownerEditing =
    ticket.createdBy === user.id &&
    ticket.status === 'Open';

  const staffEditing =
    can(user, PERMISSIONS.TICKETS_UPDATE) &&
    can(user, PERMISSIONS.TICKETS_READ_ALL);

  if (!ownerEditing && !staffEditing) {
    throw Errors.forbidden();
  }

  if (ticket.version !== patch.version) {
    throw Errors.conflict(
      'El ticket cambió. Actualiza la información antes de guardar.',
    );
  }

  const { version: _version, ...changes } = patch;
  Object.assign(ticket, changes);

  return saveWithHistory(ticket, [
    {
      actorId: user.id,
      action: 'updated',
      to: patch,
    },
  ]);
}

export async function ticketAvailableTransitions(
  id: number,
  user: AuthUser,
) {
  const ticket = await getTicketForUser(id, user);
  return availableTransitions(ticket, user);
}

export async function setDeadline(
  id: number,
  dueDate: string | null,
  user: AuthUser,
  options: {
    expectedVersion: number;
    reason: string;
  },
): Promise<Ticket> {
  if (!can(user, PERMISSIONS.TICKETS_DEADLINE_UPDATE)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);

  if (ticket.version !== options.expectedVersion) {
    throw Errors.conflict(
      'El ticket cambió. Actualiza la información antes de modificar el plazo.',
    );
  }

  if (ticket.status === 'Closed') {
    throw Errors.invalidState(
      'No se puede modificar el plazo de un ticket cerrado.',
    );
  }

  if (
    dueDate !== null &&
    new Date(dueDate).getTime() <= Date.now()
  ) {
    throw Errors.validation([
      {
        field: 'dueDate',
        message: 'El plazo debe ser una fecha futura.',
      },
    ]);
  }

  const current = ticket.dueDate;
  const unchanged =
    dueDate === null
      ? current === null
      : current !== null &&
        new Date(current).getTime() ===
          new Date(dueDate).getTime();

  if (unchanged) return ticket;

  ticket.dueDate = dueDate;

  return saveWithHistory(ticket, [
    {
      actorId: user.id,
      action: 'deadline_changed',
      from: current,
      to: dueDate,
      reason: options.reason,
    },
  ]);
}

export async function addProgressUpdate(
  id: number,
  note: string,
  user: AuthUser,
) {
  if (!can(user, PERMISSIONS.TICKETS_PROGRESS_CREATE)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(id, user);
  mustBeAssignedTechnicianOrStaff(ticket, user);

  if (ticket.status === 'Closed') {
    throw Errors.invalidState(
      'No se pueden registrar avances en un ticket cerrado.',
    );
  }

  return ticketsRepository.addHistory({
    ticketId: id,
    actorId: user.id,
    action: 'progress_update',
    to: note,
  });
}

export async function linkRecurringProblem(
  ticketId: number,
  articleId: number,
  user: AuthUser,
): Promise<number[]> {
  const ticket = await getTicketForUser(ticketId, user);

  const isAssigned =
    ticket.assignedTechnicianId === user.id;
  const isStaff = can(
    user,
    PERMISSIONS.TICKETS_READ_ALL,
  );

  if (!isAssigned && !isStaff) {
    throw Errors.forbidden();
  }

  const article = await getArticle(articleId, user);

  if (!article.isRecurringProblem) {
    throw Errors.validation([
      {
        field: 'articleId',
        message:
          'El artículo no está marcado como problema recurrente.',
      },
    ]);
  }

  await ticketsRepository.linkRecurringProblem(
    ticketId,
    articleId,
    user.id,
  );

  recordAudit({
    action: 'ticket.recurring_problem_linked',
    entity: 'ticket',
    entityId: ticketId,
    actorId: user.id,
    metadata: { articleId },
  });

  return ticketsRepository.getRecurringProblems(ticketId);
}

export async function unlinkRecurringProblem(
  ticketId: number,
  articleId: number,
  user: AuthUser,
): Promise<number[]> {
  const ticket = await getTicketForUser(ticketId, user);

  const isAssigned =
    ticket.assignedTechnicianId === user.id;
  const isStaff = can(
    user,
    PERMISSIONS.TICKETS_READ_ALL,
  );

  if (!isAssigned && !isStaff) {
    throw Errors.forbidden();
  }

  await ticketsRepository.unlinkRecurringProblem(
    ticketId,
    articleId,
  );

  recordAudit({
    action: 'ticket.recurring_problem_unlinked',
    entity: 'ticket',
    entityId: ticketId,
    actorId: user.id,
    metadata: { articleId },
  });

  return ticketsRepository.getRecurringProblems(ticketId);
}

export async function getRecurringProblems(
  ticketId: number,
  user: AuthUser,
): Promise<number[]> {
  await getTicketForUser(ticketId, user);
  return ticketsRepository.getRecurringProblems(ticketId);
}
