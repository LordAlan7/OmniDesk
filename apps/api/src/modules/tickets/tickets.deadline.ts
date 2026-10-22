import { can, PERMISSIONS } from '../../shared/authorization';
import type { AuthUser } from '../../shared/types';
import type { Ticket, TicketStatus } from './tickets.types';

/**
 * Flujo único de estados (FR-008). Propuesto, pendiente de aprobación del negocio:
 * Open → Assigned → In Progress → Resolved → Closed, con reapertura Resolved → In Progress.
 */
export const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  Open: ['Assigned'],
  Assigned: ['In Progress'],
  'In Progress': ['Resolved'],
  Resolved: ['In Progress', 'Closed'],
  Closed: [],
};

/** Estados que detienen el seguimiento del plazo (no cuentan como vencidos). */
export const DEADLINE_STOPPED_STATUSES: readonly TicketStatus[] = ['Resolved', 'Closed'];

/**
 * El vencimiento NO es un estado del flujo: se calcula con el plazo, la hora actual y el estado.
 * Un ticket sin plazo nunca se considera vencido.
 */
export function isOverdue(
  ticket: Pick<Ticket, 'dueDate' | 'status'>,
  now: Date = new Date(),
): boolean {
  if (!ticket.dueDate) return false;
  if (DEADLINE_STOPPED_STATUSES.includes(ticket.status)) return false;
  return new Date(ticket.dueDate).getTime() < now.getTime();
}

export interface AvailableTransition {
  to: TicketStatus;
  /** Endpoint que ejecuta la transición. */
  via: 'status' | 'resolution' | 'close';
  requiresResolution?: boolean;
}

/** Transiciones que el usuario puede ejecutar hoy sobre el ticket (permisos + asignación). */
export function availableTransitions(ticket: Ticket, user: AuthUser): AvailableTransition[] {
  const assigned = ticket.assignedTechnicianId === user.id;
  const staff = can(user, PERMISSIONS.TICKETS_READ_ALL);
  if (!assigned && !staff) return [];

  return TRANSITIONS[ticket.status].flatMap((to): AvailableTransition[] => {
    if (to === 'Assigned') return []; // solo mediante la asignación (FR-007)
    if (to === 'Resolved') {
      return can(user, PERMISSIONS.TICKETS_RESOLVE)
        ? [{ to, via: 'resolution', requiresResolution: true }]
        : [];
    }
    if (to === 'Closed') {
      return can(user, PERMISSIONS.TICKETS_CLOSE) ? [{ to, via: 'close' }] : [];
    }
    return can(user, PERMISSIONS.TICKETS_STATUS_UPDATE) ? [{ to, via: 'status' }] : [];
  });
}
