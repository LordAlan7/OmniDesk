/**
 * Estados y prioridades provisionales.
 * Pendientes de validación con las reglas del proyecto.
 */
export const TICKET_STATUSES = [
  'Open',
  'Assigned',
  'In Progress',
  'Resolved',
  'Closed',
] as const;

export type TicketStatus =
  (typeof TICKET_STATUSES)[number];

export const PRIORITIES: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
};

export interface Ticket {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  priorityId: number | null;
  status: TicketStatus;
  createdBy: number;
  assignedTechnicianId: number | null;
  assignedTechnicianName?: string | null;
  dueDate: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  version: number;
}

export interface TicketHistoryEntry {
  id: number;
  ticketId: number;
  actorId: number;
  action: string;
  from?: unknown;
  to?: unknown;
  reason?: string | null;
  createdAt: string;
}