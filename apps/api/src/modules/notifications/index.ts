/**
 * Módulo NOTIFICATIONS (FR-020)
 * API pública: otros módulos SOLO deben importar desde este archivo.
 *
 * Dependencias permitidas: ninguna (es módulo base). El acceso a tickets
 * se valida mediante un hook inyectado desde app.ts (configureAccessibleTicketIdsChecker),
 * para evitar el ciclo notifications → tickets → knowledge → files → tickets.
 */
export { notificationsRouter } from './notifications.routes';

// Service: lo usan tickets.service.ts y tickets.postgres.repository.ts para
// insertar notificaciones dentro de la transacción del cambio.
export {
  notifyInTransaction,
  notifyInMemory,
  buildNotificationsForEvent,
  configureAccessibleTicketIdsChecker,
  listForUser,
  unreadCountForUser,
  markRead,
  markAllRead,
} from './notifications.service';

// Catálogo: lo usan tests y documentación.
export { NOTIFICATION_EVENTS, NOTIFIABLE_EVENT_TYPES, notificationEventFor } from './notifications.catalog';

export type { Notification, NotificationInput, NotificationPage } from './notifications.types';
export type { NotificationEventDefinition } from './notifications.catalog';