import { Ticket, TicketHistoryEntry, TicketStatus } from './tickets.types';

export interface TicketFilter {
  /** Si es null, ve todos los tickets; si no, solo los propios/asignados a ese usuario. */
  visibleTo: number | null;
  status?: TicketStatus;
  priorityId?: number;
  categoryId?: number;
}

/**
 * Repositorio EN MEMORIA (esqueleto). Mantén esta interfaz al migrar a PostgreSQL.
 */
const tickets: Ticket[] = [];
const history: TicketHistoryEntry[] = [];
let nextTicketId = 1;
let nextHistoryId = 1;

export const ticketsRepository = {
  create(data: Pick<Ticket, 'title' | 'description' | 'categoryId' | 'createdBy'>): Ticket {
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: nextTicketId++,
      ...data,
      priorityId: null,
      status: 'Open',
      assignedTechnicianId: null,
      dueDate: null,
      resolution: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      closedAt: null,
    };
    tickets.push(ticket);
    return ticket;
  },

  findById: (id: number) => tickets.find((t) => t.id === id),

  list(filter: TicketFilter): Ticket[] {
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
      .reverse();
  },

  save(ticket: Ticket): Ticket {
    ticket.updatedAt = new Date().toISOString();
    return ticket;
  },

  addHistory(entry: Omit<TicketHistoryEntry, 'id' | 'createdAt'>): TicketHistoryEntry {
    const record = { ...entry, id: nextHistoryId++, createdAt: new Date().toISOString() };
    history.push(record);
    return record;
  },

  historyOf: (ticketId: number) => history.filter((h) => h.ticketId === ticketId),
};
