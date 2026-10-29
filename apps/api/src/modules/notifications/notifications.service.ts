import { env } from '../../config/env';
import { currentCorrelationId } from '../../shared/context/requestContext';
import { can, PERMISSIONS } from '../../shared/authorization';
import type { AuthUser } from '../../shared/types';
import type { DatabaseClient } from '../../shared/db/types';
import { notificationEventFor, type NotificationContext } from './notifications.catalog';
import { memoryNotificationsRepository } from './notifications.repository';
import { postgresNotificationsRepository } from './notifications.postgres.repository';
import type { Notification, NotificationInput, NotificationPage } from './notifications.types';

const useMemory = env.nodeEnv === 'test';

// ──────────────────────────────────────────────────────────────────────────
// DI: validador de acceso a tickets (rompe el ciclo notifications → tickets)
// ──────────────────────────────────────────────────────────────────────────
// Mismo patrón que configureArticleReferenceChecker y configurePendingTicketsChecker:
// app.ts inyecta la implementación concreta. Así notifications no importa tickets.
type AccessibleTicketIdsChecker = (userId: number) => Promise<number[]>;
let checkAccessibleTicketIds: AccessibleTicketIdsChecker | undefined;

export function configureAccessibleTicketIdsChecker(
  checker: AccessibleTicketIdsChecker,
): void {
  checkAccessibleTicketIds = checker;
}

// ──────────────────────────────────────────────────────────────────────────
// Construye las notificaciones para un evento (función pura)
// ──────────────────────────────────────────────────────────────────────────
export interface NotifyEventContext {
  /** Usuario que ejecutó la acción (se excluye siempre — decisión 1). */
  actor: AuthUser;
  /** Ticket después del cambio (con el nuevo assignedTechnicianId, status, etc.). */
  next: {
    id: number;
    createdBy: number;
    assignedTechnicianId: number | null;
    status: string;
  };
  /** Asignado anterior (para excluirlo en reasignación — decisión 2). */
  previousAssigneeId: number | null;
  /** historyAction del ticket (ej: 'assigned', 'status_changed', 'reopened'). */
  historyAction: string;
}

/**
 * Construye la lista de NotificationInput para un evento.
 * Usa el catálogo para calcular destinatarios y mensaje.
 * La deduplicación se maneja en el repositorio (ON CONFLICT DO NOTHING).
 */
export function buildNotificationsForEvent(ctx: NotifyEventContext): NotificationInput[] {
  const def = notificationEventFor(ctx.historyAction);
  if (!def) return [];

  const catalogCtx: NotificationContext = {
    actor: ctx.actor,
    ticket: ctx.next as NotificationContext['ticket'],
    next: ctx.next as NotificationContext['next'],
    previousAssigneeId: ctx.previousAssigneeId,
  };

  const recipientIds = def.recipients(catalogCtx);
  const correlationId = currentCorrelationId();
  const message = def.message(ctx.next as NotificationContext['next']);

  // Deduplica destinatarios (por si el catálogo devuelve duplicados).
  const uniqueRecipientIds = [...new Set(recipientIds)];

  return uniqueRecipientIds.map((userId) => ({
    userId,
    ticketId: ctx.next.id,
    eventType: def.eventType,
    message,
    refEntity: 'ticket',
    refId: ctx.next.id,
    // dedup_key = (userId, ticketId, eventType, correlationId).
    // Decisión 7: si el correlationId es el mismo (doble-envío), se ignora.
    // Si el correlationId es distinto (eventos diferentes en el tiempo), se guarda.
    dedupKey: `${userId}|${ctx.next.id}|${def.eventType}|${correlationId ?? 'no-correlation'}`,
    correlationId,
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Notificar dentro de la transacción del cambio (PostgreSQL)
// ──────────────────────────────────────────────────────────────────────────
// Se llama desde tickets.postgres.repository.ts dentro de saveWithHistory.
// Si la inserción de la notificación falla, el cambio del ticket se revierte
// (igual que audit_log — NFR-009).
export async function notifyInTransaction(
  client: DatabaseClient,
  ctx: NotifyEventContext,
): Promise<void> {
  const inputs = buildNotificationsForEvent(ctx);
  for (const input of inputs) {
    await postgresNotificationsRepository.addInTransaction(client, input);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Notificar en memoria (tests)
// ──────────────────────────────────────────────────────────────────────────
// Se llama desde tickets.repository.ts (memoria) después de saveWithHistory.
export function notifyInMemory(ctx: NotifyEventContext): void {
  const inputs = buildNotificationsForEvent(ctx);
  for (const input of inputs) {
    memoryNotificationsRepository.add(input);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Consulta con revalidación de acceso (decisión 3)
// ──────────────────────────────────────────────────────────────────────────
/**
 * Lista las notificaciones del usuario, ocultando las de tickets a los que
 * ya no tiene acceso (reasignación, desactivación). Las notificaciones no se
 * borran; solo se ocultan (NFR-009: trazabilidad).
 */
export async function listForUser(
  user: AuthUser,
  filters: { onlyUnread?: boolean; page: number; limit: number },
): Promise<NotificationPage> {
  const hasReadAll = can(user, PERMISSIONS.TICKETS_READ_ALL);
  let accessibleTicketIds: number[] | null = null;

  if (!hasReadAll) {
    if (!checkAccessibleTicketIds) {
      throw new Error(
        'No está configurado el validador de acceso a tickets para notificaciones.',
      );
    }
    accessibleTicketIds = await checkAccessibleTicketIds(user.id);
  }

  return useMemory
    ? memoryNotificationsRepository.list({
        userId: user.id,
        onlyUnread: filters.onlyUnread,
        accessibleTicketIds,
        page: filters.page,
        limit: filters.limit,
      })
    : postgresNotificationsRepository.list({
        userId: user.id,
        onlyUnread: filters.onlyUnread,
        accessibleTicketIds,
        page: filters.page,
        limit: filters.limit,
      });
}

/**
 * Cuenta las notificaciones no leídas del usuario, con la misma revalidación
 * de acceso que listForUser. El contador del badge coincide con lo que el
 * usuario realmente puede leer.
 */
export async function unreadCountForUser(user: AuthUser): Promise<number> {
  const hasReadAll = can(user, PERMISSIONS.TICKETS_READ_ALL);
  let accessibleTicketIds: number[] | null = null;

  if (!hasReadAll) {
    if (!checkAccessibleTicketIds) {
      throw new Error(
        'No está configurado el validador de acceso a tickets para notificaciones.',
      );
    }
    accessibleTicketIds = await checkAccessibleTicketIds(user.id);
  }

  return useMemory
    ? memoryNotificationsRepository.unreadCount(user.id, accessibleTicketIds)
    : postgresNotificationsRepository.unreadCount(user.id, accessibleTicketIds);
}

// ──────────────────────────────────────────────────────────────────────────
// Marcar como leída / marcar todas
// ──────────────────────────────────────────────────────────────────────────
// El userId se obtiene de la sesión en la ruta; aquí se pasa explícitamente
// para garantizar que un usuario no pueda marcar notificaciones ajenas.
export async function markRead(
  userId: number,
  id: number,
): Promise<Notification | undefined> {
  return useMemory
    ? memoryNotificationsRepository.markRead(userId, id)
    : postgresNotificationsRepository.markRead(userId, id);
}

export async function markAllRead(userId: number): Promise<number> {
  return useMemory
    ? memoryNotificationsRepository.markAllRead(userId)
    : postgresNotificationsRepository.markAllRead(userId);
}