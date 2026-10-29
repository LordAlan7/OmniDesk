/**
 * Catálogo de eventos notificables (FR-020).
 *
 * Define, por cada evento del ticket:
 * - `message`: mensaje breve, sin información interna (FR-009 decisión 7).
 *   Solo indica el evento y el ticket, nunca la resolución, ni las
 *   investigaciones, ni el nombre del técnico.
 * - `recipients`: función que calcula los destinatarios a partir del ticket
 *   y el actor. Devuelve IDs de usuario. El actor NUNCA se notifica (decisión 1).
 *   El técnico anterior tras reasignación NO se notifica (decisión 2).
 *
 * La función `recipients` recibe:
 * - `actor`: el usuario que ejecutó la acción (se excluye siempre).
 * - `ticket`: el ticket antes del cambio (con `assignedTechnicianId` previo).
 * - `next`: el ticket después del cambio (con `assignedTechnicianId` nuevo).
 * - `previousAssigneeId`: el asignado anterior (para excluirlo en reasignación).
 *
 * Devuelve `number[]` (IDs de destinatarios). El service deduplica y filtra.
 */
import type { Ticket } from '../tickets/tickets.types';
import type { AuthUser } from '../../shared/types';

export interface NotificationContext {
  actor: AuthUser;
  ticket: Ticket;
  next: Ticket;
  previousAssigneeId: number | null;
}

export interface NotificationEventDefinition {
  /** event_type: coincide con el historyAction del ticket. */
  eventType: string;
  /** Mensaje breve (sin info interna). Recibe el ticket. */
  message: (ticket: Ticket) => string;
  /** Calcula los destinatarios. El actor se excluye siempre. */
  recipients: (ctx: NotificationContext) => number[];
}

const event = (
  eventType: string,
  message: (ticket: Ticket) => string,
  recipients: (ctx: NotificationContext) => number[],
): NotificationEventDefinition => ({ eventType, message, recipients });

export const NOTIFICATION_EVENTS: Record<string, NotificationEventDefinition> = {
  // Asignación / reasignación (FR-007).
  // - Nuevo técnico responsable: se le notifica.
  // - Solicitante: se le notifica (su ticket fue asignado).
  // - Actor (asesor): NO.
  // - Técnico anterior: NO (perdió el acceso al reasignarse, decisión 2).
  assigned: event(
    'assigned',
    (t) => `Se asignó un técnico a tu ticket #${t.id}.`,
    ({ actor, next, previousAssigneeId }) => {
      const recipients: number[] = [];
      // Nuevo técnico responsable (si cambió).
      if (next.assignedTechnicianId !== null && next.assignedTechnicianId !== actor.id) {
        recipients.push(next.assignedTechnicianId);
      }
      // Solicitante (creador), si no es el actor.
      if (next.createdBy !== actor.id) {
        recipients.push(next.createdBy);
      }
      // Excluir técnico anterior explícitamente (decisión 2).
      return recipients.filter((id) => id !== previousAssigneeId);
    },
  ),

  // Cambio de prioridad (FR-006).
  // - Técnico responsable actual: se le notifica.
  // - Solicitante: se le notifica.
  // - Actor (manager): NO.
  priority_changed: event(
    'priority_changed',
    (t) => `Cambió la prioridad del ticket #${t.id}.`,
    ({ actor, next }) => {
      const recipients: number[] = [];
      if (next.assignedTechnicianId !== null && next.assignedTechnicianId !== actor.id) {
        recipients.push(next.assignedTechnicianId);
      }
      if (next.createdBy !== actor.id) {
        recipients.push(next.createdBy);
      }
      return recipients;
    },
  ),

  // Cambio de estado a In Progress (FR-008).
  // - Solicitante: se le notifica (su ticket pasó a En progreso).
  // - Actor (técnico): NO.
  // Nota: la transición a Resolved y Closed tienen sus propios eventos abajo;
  // este cubre Assigned → In Progress y Reopened → In Progress (parcial).
  status_changed: event(
    'status_changed',
    (t) => `El estado de tu ticket #${t.id} cambió a "${t.status}".`,
    ({ actor, next }) => {
      const recipients: number[] = [];
      // Solo se notifica al solicitante; el técnico ya sabe (es el actor).
      if (next.createdBy !== actor.id) {
        recipients.push(next.createdBy);
      }
      return recipients;
    },
  ),

  // Reapertura (FR-009).
  // - Solicitante: se le notifica (su ticket fue reabierto).
  // - Actor: NO.
  reopened: event(
    'reopened',
    (t) => `Tu ticket #${t.id} fue reabierto.`,
    ({ actor, next }) => {
      const recipients: number[] = [];
      if (next.createdBy !== actor.id) {
        recipients.push(next.createdBy);
      }
      // El técnico asignado también debe saber (si no es el actor).
      if (next.assignedTechnicianId !== null && next.assignedTechnicianId !== actor.id) {
        recipients.push(next.assignedTechnicianId);
      }
      return recipients;
    },
  ),

  // Investigación registrada (FR-009).
  // - Solicitante: se le notifica (hay actividad en su ticket).
  // - Actor (técnico): NO.
  investigation_logged: event(
    'investigation_logged',
    (t) => `Se registró actividad de investigación en tu ticket #${t.id}.`,
    ({ actor, next }) => {
      const recipients: number[] = [];
      if (next.createdBy !== actor.id) {
        recipients.push(next.createdBy);
      }
      return recipients;
    },
  ),
};

/**
 * Devuelve la definición del evento notificable para un historyAction.
 * Si el evento no está en el catálogo (p. ej. 'created', 'updated',
 * 'category_changed', 'business_info_updated', 'deadline_changed',
 * 'closed_comment', 'progress_update'), devuelve undefined (no notifica).
 *
 * Decisiones de la matriz:
 * - 'created' no notifica (el creador ya sabe).
 * - 'updated', 'category_changed', 'business_info_updated' no notifican
 *   (son ediciones administrativas; el solicitante ve el detalle cuando entra).
 * - 'deadline_changed' no notifica (es interno del staff).
 * - 'closed_comment' no notifica (es un comentario de cierre, no un evento).
 * - 'progress_update' no notifica (es una nota interna; el solicitante no la ve).
 */
export function notificationEventFor(
  historyAction: string,
): NotificationEventDefinition | undefined {
  return NOTIFICATION_EVENTS[historyAction];
}

/**
 * Lista de eventos notificables (para documentación y tests).
 */
export const NOTIFIABLE_EVENT_TYPES = Object.keys(NOTIFICATION_EVENTS);