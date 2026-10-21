import { z } from 'zod';
import { Errors } from '../../shared/errors';
import { paginationSchema } from '../../shared/http';
import { can, PERMISSIONS } from '../../shared/authorization';
import type { AuthUser } from '../../shared/types';
import { ticketsRepository } from './tickets.repository';
import { TICKET_STATUSES, type Ticket, type TicketHistoryEntry } from './tickets.types';

export const trackingQuery = paginationSchema.extend({
  ticketId: z.coerce.number().int().positive().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
}).strict();

// Explicit public event contract: unknown actions and free-text payloads stay private.
export function publicUpdates(entries: TicketHistoryEntry[]) {
  return entries.filter(e => e.action === 'created' ||
    (e.action === 'status_changed' &&
      TICKET_STATUSES.includes(e.from as Ticket['status']) &&
      TICKET_STATUSES.includes(e.to as Ticket['status'])))
    .map(e => ({ id: e.id, ticketId: e.ticketId, action: e.action,
      ...(e.action === 'status_changed' ? { from: e.from, to: e.to } : {}),
      createdAt: e.createdAt }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
}

export function canReadInternalHistory(ticket: Ticket, user: AuthUser) {
  return can(user, PERMISSIONS.TICKETS_HISTORY_READ) &&
    (can(user, PERMISSIONS.TICKETS_READ_ALL) ||
      (user.roles.includes('Technician') && ticket.assignedTechnicianId === user.id));
}

export async function trackingTicket(ticket: Ticket) {
  const updates = publicUpdates(await ticketsRepository.historyOf(ticket.id));
  // Do not include updatedAt/version: those also change for private activity.
  return { id: ticket.id, title: ticket.title, description: ticket.description,
    status: ticket.status, createdAt: ticket.createdAt,
    storeLocation: ticket.storeLocation, motorcycleModel: ticket.motorcycleModel,
    resolution: ['Resolved', 'Closed'].includes(ticket.status) ? ticket.resolution : null,
    resolvedAt: ticket.resolvedAt, closedAt: ticket.closedAt,
    lastVisibleUpdateAt: updates.length ? updates[updates.length - 1]!.createdAt : ticket.createdAt,
    updates };
}

function requireRead(user: AuthUser) {
  if (!can(user, PERMISSIONS.TICKETS_READ)) throw Errors.forbidden();
}

export async function listOwnTickets(user: AuthUser, q: { ticketId?: number; status?: Ticket['status'] }) {
  requireRead(user);
  const tickets = await ticketsRepository.list({ visibleTo: user.id, status: q.status });
  // Creator ownership applies even when the user also has a staff role.
  return Promise.all(tickets.filter(t => t.createdBy === user.id &&
    (q.ticketId === undefined || t.id === q.ticketId)).map(trackingTicket));
}

export async function ownTicket(id: number, user: AuthUser) {
  requireRead(user);
  const ticket = await ticketsRepository.findById(id);
  if (!ticket || ticket.createdBy !== user.id) throw Errors.notFound('Ticket');
  return trackingTicket(ticket);
}
