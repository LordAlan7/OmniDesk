/**
 * Módulo NOTIFICATIONS (FR-020)
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { notificationsRouter } from './notifications.routes';
export { notify, registerChannel } from './notifications.service';
export type { NotificationChannel, Notification } from './notifications.service';
