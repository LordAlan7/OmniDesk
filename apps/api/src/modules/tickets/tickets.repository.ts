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
  async create(
    data: Pick<Ticket, 'title' | 'description' | 'categoryId' | 'createdBy' | 'storeLocation' | 'motorcycleModel'>,
  ): Promise<Ticket> {
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: nextTicketId++,
      title: data.title,
      description: data.description,
      categoryId: data.categoryId,
      createdBy: data.createdBy,
      storeLocation: data.storeLocation,
      motorcycleModel: data.motorcycleModel,
      priorityId: null,
      status: 'Open',
      assignedTechnicianId: null,
      dueDate: null,
      resolution: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      closedAt: null,
      version: 1,
    };
    tickets.push(ticket);
    return ticket;
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