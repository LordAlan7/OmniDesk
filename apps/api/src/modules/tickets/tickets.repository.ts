import { Errors } from '../../shared/errors';
import { assertStatusInvariants } from './tickets.lifecycle';
import { env } from '../../config/env';
import { Ticket, TicketHistoryEntry, TicketStatus } from './tickets.types';
import { postgresTicketsRepository } from './tickets.postgres.repository';

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
let nextTicketId = 1;
let nextHistoryId = 1;

const ticketsMemoryRepository = {

    async listCategories() {
    return [
      { id: 1, name: 'Acceso' },
      { id: 2, name: 'Hardware' },
      { id: 3, name: 'Software' },
      { id: 4, name: 'Red' }
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
      storeLocation: data.storeLocation || null,     // NUEVO
      motorcycleModel: data.motorcycleModel || null, // NUEVO
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      closedAt: null,
      version: 1,
    };
    tickets.push(ticket);
    history.push({ id: nextHistoryId++, ticketId: ticket.id, actorId: data.createdBy, action: 'created', to: 'Open', createdAt: now });
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

  async saveWithHistory(ticket: Ticket, expectedVersion: number, entries: Omit<TicketHistoryEntry, 'id' | 'createdAt' | 'ticketId'>[]): Promise<Ticket> {
    assertStatusInvariants(ticket);
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
      history.push({ ...entry, ticketId: current.id, id: nextHistoryId++, createdAt: now });
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
      createdAt: new Date().toISOString(),
    };
    history.push(record);
    return record;
  },

  async historyOf(ticketId: number): Promise<TicketHistoryEntry[]> {
    return history.filter((h) => h.ticketId === ticketId);
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
  nextTicketId = 1;
  nextHistoryId = 1;
}
