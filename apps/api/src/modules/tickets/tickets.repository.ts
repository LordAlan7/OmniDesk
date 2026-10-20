import {
  Ticket,
  TicketHistoryEntry,
  TicketStatus,
} from './tickets.types';

export interface TicketFilter {
  /** null permite consultar todos; otro valor limita a propios/asignados. */
  visibleTo: number | null;
  status?: TicketStatus;
  priorityId?: number;
  categoryId?: number;
}

/**
 * Repositorio en memoria.
 * Se conserva para las pruebas al integrar PostgreSQL.
 */
const tickets: Ticket[] = [];
const history: TicketHistoryEntry[] = [];

let nextTicketId = 1;
let nextHistoryId = 1;

export const ticketsRepository = {
  create(
    data: Pick<
      Ticket,
      'title' | 'description' | 'categoryId' | 'createdBy'
    >,
  ): Ticket {
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
      version: 1,
    };

    tickets.push(ticket);
    return ticket;
  },

  findById(id: number): Ticket | undefined {
    return tickets.find((ticket) => ticket.id === id);
  },

  list(filter: TicketFilter): Ticket[] {
    return tickets
      .filter(
        (ticket) =>
          (
            filter.visibleTo === null ||
            ticket.createdBy === filter.visibleTo ||
            ticket.assignedTechnicianId === filter.visibleTo
          ) &&
          (
            !filter.status ||
            ticket.status === filter.status
          ) &&
          (
            filter.priorityId === undefined ||
            ticket.priorityId === filter.priorityId
          ) &&
          (
            filter.categoryId === undefined ||
            ticket.categoryId === filter.categoryId
          ),
      )
      .reverse();
  },

  save(ticket: Ticket): Ticket {
    ticket.updatedAt = new Date().toISOString();
    return ticket;
  },

  addHistory(
    entry: Omit<TicketHistoryEntry, 'id' | 'createdAt'>,
  ): TicketHistoryEntry {
    const record: TicketHistoryEntry = {
      ...entry,
      id: nextHistoryId++,
      createdAt: new Date().toISOString(),
    };

    history.push(record);
    return record;
  },

  historyOf(ticketId: number): TicketHistoryEntry[] {
    return history.filter(
      (entry) => entry.ticketId === ticketId,
    );
  },
};