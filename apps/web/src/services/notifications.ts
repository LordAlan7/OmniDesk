import { api, apiPage } from '@/api/http'

export interface Notification {
  id: number
  userId: number
  ticketId: number | null
  eventType: string
  message: string
  refEntity: string
  refId: number | null
  read: boolean
  readAt: string | null
  dedupKey: string
  correlationId: string | null
  createdAt: string
}

/** Lista las notificaciones del usuario autenticado (paginada). */
export function listNotifications(
  page = 1,
  limit = 20,
  onlyUnread = false,
) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  if (onlyUnread) query.set('unread', 'true')
  return apiPage<Notification[]>(`/me/notifications?${query.toString()}`)
}

/** Cantidad de notificaciones no leídas (para el badge). */
export async function getUnreadCount(): Promise<number> {
  const result = await api<{ count: number }>('/me/notifications/unread-count')
  return result.count
}

/** Marca una notificación como leída (acción explícita — decisión 4). */
export async function markNotificationRead(id: number): Promise<Notification> {
  const result = await api<Notification>(
    `/me/notifications/${id}/read`,
    { method: 'PATCH' },
  )
  return result
}

/** Marca todas las notificaciones del usuario como leídas. */
export async function markAllNotificationsRead(): Promise<number> {
  const result = await api<{ updated: number }>(
    '/me/notifications/read-all',
    { method: 'PATCH' },
  )
  return result.updated
}