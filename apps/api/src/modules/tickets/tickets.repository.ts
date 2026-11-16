import { Errors } from '../../shared/errors';
import { assertStatusInvariants } from './tickets.lifecycle';
import { env } from '../../config/env';
import { currentCorrelationId } from '../../shared/context/requestContext';
import { recordAuditInMemory } from '../audit';
import { ticketAuditFor } from './tickets.audit';
import { findUserById } from '../users';
import { Ticket, TicketHistoryEntry, TicketInvestigation, TicketStatus } from './tickets.types';
import { postgresTicketsRepository } from './tickets.postgres.repository';
import type { RecurringProblemLink } from './tickets.types'; // Asegúrate de importarlo
import { notifyInMemory } from '../notifications';
const recurringLinks: RecurringProblemLink[] = [];

export interface TicketFilter {
  visibleTo: number | null;
  status?: TicketStatus;
  priorityId?: number;
  categoryId?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Implementación en memoria (tests y desarrollo sin BD)
// ──────────────────────────────────────────────────────────────────────────────
const tickets: Ticket[] = [];
const history: TicketHistoryEntry[] = [];
const investigations: TicketInvestigation[] = [];
let nextTicketId = 1;
let nextHistoryId = 1;
let nextInvestigationId = 1;

const ticketsMemoryRepository = {

  async listCategories() {
    return [
      { id: 1, name: 'Acceso' },
      { id: 2, name: 'Hardware' },
      { id: 3, name: 'Software' },
      { id: 4, name: 'Red' }
    ];
  },

  async listPriorities() {
    return [
      { id: 1, name: 'Low', description: 'Baja - Problema con impacto mínimo, sin urgencia', sortOrder: 1 },
      { id: 2, name: 'Medium', description: 'Media - Problema con impacto moderado, atención normal', sortOrder: 2 },
      { id: 3, name: 'High', description: 'Alta - Problema importante que afecta operaciones', sortOrder: 3 },
      { id: 4, name: 'Critical', description: 'Crítica - Problema urgente que bloquea operaciones', sortOrder: 4 },
    ];
  },

  async create(
    data: Pick<Ticket, 'title' | 'description' | 'categoryId' | 'createdBy' | 'storeLocation' | 'motorcycleModel'>,
  ): Promise<Ticket> {
    if (![1, 2, 3, 4].includes(data.categoryId)) {
      throw Errors.validation([{ field: 'categoryId', message: 'La categoría seleccionada no existe.' }]);
    }
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: nextTicketId++,
      title: data.title,
      description: data.description,
      categoryId: data.categoryId,
      createdBy: data.createdBy,
      priorityId: null,
      status: 'Open',
      assignedTechnicianId: null,
      dueDate: null,
      resolution: null,
      resolutionVerification: null,
      rootCause: null,
      resolutionObservations: null,
      knowledgeArticleId: null,
      storeLocation: data.storeLocation || null,
      motorcycleModel: data.motorcycleModel || null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      closedAt: null,
      version: 1,
    };
    tickets.push(ticket);
    history.push({
      id: nextHistoryId++,
      ticketId: ticket.id,
      actorId: data.createdBy,
      action: 'created',
      to: 'Open',
      correlationId: currentCorrelationId(),
      createdAt: now,
    });
    recordAuditInMemory({ action: 'ticket.created', entity: 'ticket', entityId: ticket.id, actorId: data.createdBy, metadata: { to: 'Open' } });
    return { ...ticket };
  },

  async findById(id: number): Promise<Ticket | undefined> {
    return tickets.find((t) => t.id === id);
  },

  async list(filter: TicketFilter): Promise<Ticket[]> {
    return tickets
      .filter(
        (t) =>
          (filter.visibleTo === null ||
            t.createdBy === filter.visibleTo ||
            t.assignedTechnicianId === filter.visibleTo) &&
          (!filter.status || t.status === filter.status) &&
          (filter.priorityId === undefined || t.priorityId === filter.priorityId) &&
          (filter.categoryId === undefined || t.categoryId === filter.categoryId),
      )
      .slice()
      .reverse();
  },

    async saveWithHistory(ticket: Ticket, expectedVersion: number, entries: Omit<TicketHistoryEntry, 'id' | 'createdAt' | 'ticketId'>[], saveContext?: { actorId: number; previousAssigneeId: number | null }): Promise<Ticket> {
    const current = tickets.find(t => t.id === ticket.id);
    if (!current || current.version !== expectedVersion) {
      throw Errors.conflict('El ticket cambió. Actualiza la información antes de guardar.');
    }
    if (![1, 2, 3, 4].includes(ticket.categoryId)) {
      throw Errors.validation([{ field: 'categoryId', message: 'La categoría seleccionada no existe.' }]);
    }
    const now = new Date().toISOString();
    Object.assign(current, ticket, { version: expectedVersion + 1, updatedAt: now });
    for (const entry of entries) {
      history.push({ ...entry, ticketId: current.id, id: nextHistoryId++, correlationId: currentCorrelationId(), createdAt: now });
      const audit = ticketAuditFor(current.id, entry);
      if (audit) recordAuditInMemory(audit);
    }

    // FR-020: generar notificaciones por cada entry (dentro del mismo ciclo lógico).
    if (saveContext) {
      notifyInMemory({
        actor: { id: saveContext.actorId, email: '', name: '', roles: [] },
        next: { id: current.id, createdBy: current.createdBy, assignedTechnicianId: current.assignedTechnicianId, status: current.status },
        previousAssigneeId: saveContext.previousAssigneeId,
        historyAction: entries[entries.length - 1]?.action ?? 'status_changed',
      });
    }

    return { ...current };
  },

  async save(ticket: Ticket): Promise<Ticket> {
    ticket.updatedAt = new Date().toISOString();
    ticket.version += 1;
    return ticket;
  },

  async addHistory(
    entry: Omit<TicketHistoryEntry, 'id' | 'createdAt'>,
  ): Promise<TicketHistoryEntry> {
    const record = {
      ...entry,
      id: nextHistoryId++,
      correlationId: currentCorrelationId(),
      createdAt: new Date().toISOString(),
    };
    history.push(record);
    const audit = ticketAuditFor(entry.ticketId, entry);
    if (audit) recordAuditInMemory(audit);
    return record;
  },

  async historyOf(ticketId: number): Promise<TicketHistoryEntry[]> {
    return history.filter((h) => h.ticketId === ticketId);
  },

    // ──────────────────────────────────────────────────────────────────────────────
  // FR-019: Problemas recurrentes (memoria)
  // ──────────────────────────────────────────────────────────────────────────────
  async linkRecurringProblem(ticketId: number, articleId: number, linkedBy: number): Promise<void> {
    if (!recurringLinks.some((l) => l.ticketId === ticketId && l.articleId === articleId)) {
      recurringLinks.push({ ticketId, articleId, linkedBy, linkedAt: new Date().toISOString() });
    } else {
      throw Errors.conflict('Este problema ya está vinculado a este ticket.');
    }
  },

  async unlinkRecurringProblem(ticketId: number, articleId: number): Promise<void> {
    const index = recurringLinks.findIndex((l) => l.ticketId === ticketId && l.articleId === articleId);
    if (index === -1) throw Errors.notFound('Vínculo de problema recurrente');
    recurringLinks.splice(index, 1);
  },

  async getRecurringProblems(ticketId: number): Promise<number[]> {
    return recurringLinks.filter((l) => l.ticketId === ticketId).map((l) => l.articleId);
  },

  // ──────────────────────────────────────────────────────────────────────────
  // FR-009: investigaciones
  // ──────────────────────────────────────────────────────────────────────────
  async addInvestigation(
    input: Omit<TicketInvestigation, 'id' | 'createdAt' | 'authorName' | 'knowledgeArticleTitle'>,
  ): Promise<TicketInvestigation> {
    const now = new Date().toISOString();
    const investigation: TicketInvestigation = {
      id: nextInvestigationId++,
      ticketId: input.ticketId,
      authorId: input.authorId,
      activity: input.activity,
      result: input.result,
      knowledgeArticleId: input.knowledgeArticleId ?? null,
      createdAt: now,
    };
    investigations.push(investigation);

    // Evento en ticket_history (texto libre no se copia a audit_log: valuesInAudit=false).
    history.push({
      id: nextHistoryId++,
      ticketId: input.ticketId,
      actorId: input.authorId,
      action: 'investigation_logged',
      correlationId: currentCorrelationId(),
      createdAt: now,
    });

    // NFR-009: el evento de auditoría se confirma junto con el cambio.
    const audit = ticketAuditFor(input.ticketId, {
      actorId: input.authorId,
      action: 'investigation_logged',
    });
    if (audit) recordAuditInMemory(audit);

    // FR-020: notificar al solicitante (no al actor).
    notifyInMemory({
      actor: { id: input.authorId, email: '', name: '', roles: [] },
      next: {
        id: input.ticketId,
        createdBy: tickets.find((t) => t.id === input.ticketId)?.createdBy ?? 0,
        assignedTechnicianId: tickets.find((t) => t.id === input.ticketId)?.assignedTechnicianId ?? null,
        status: tickets.find((t) => t.id === input.ticketId)?.status ?? 'Open',
      },
      previousAssigneeId: null,
      historyAction: 'investigation_logged',
    });

    // Resuelve el nombre del autor y el título del artículo para devolverlos ya poblados.
    const author = await findUserById(input.authorId);
    let knowledgeArticleTitle: string | null = null;
    if (input.knowledgeArticleId) {
      // En memoria no tenemos el repositorio de knowledge cargado; el service ya validó
      // la existencia y el estado 'approved' antes de llamar al repositorio. El título
      // se resuelve en la respuesta del service usando el hook inyectado.
      knowledgeArticleTitle = null;
    }

    return {
      ...investigation,
      authorName: author?.name ?? `Usuario #${input.authorId}`,
      knowledgeArticleTitle,
    };
  },

  async listInvestigations(ticketId: number): Promise<TicketInvestigation[]> {
    const list = investigations.filter((i) => i.ticketId === ticketId);
    // Resuelve nombres para que la respuesta sea consistente con la versión PostgreSQL.
    return Promise.all(
      list.map(async (inv) => {
        const author = await findUserById(inv.authorId);
        return {
          ...inv,
          authorName: author?.name ?? `Usuario #${inv.authorId}`,
          knowledgeArticleTitle: inv.knowledgeArticleTitle ?? null,
        };
      }),
    );
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Switch: en tests usar memoria (rápido, sin BD); en dev/prod usar PostgreSQL.
// ──────────────────────────────────────────────────────────────────────────────
const useMemory = env.nodeEnv === 'test';

export const ticketsRepository = useMemory
  ? ticketsMemoryRepository
  : postgresTicketsRepository;

export function resetTicketsRepository(): void {
  tickets.length = 0;
  history.length = 0;
  investigations.length = 0;
  nextTicketId = 1;
  nextHistoryId = 1;
  nextInvestigationId = 1;
}