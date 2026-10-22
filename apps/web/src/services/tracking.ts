import { apiRequest } from './api'
import type { TicketStatus } from './tickets'
export interface PublicUpdate {
  id: number; ticketId: number; action: string; from?: unknown; to?: unknown; createdAt: string
}
export interface TrackingTicket {
  id: number; title: string; description: string; status: TicketStatus; createdAt: string
  storeLocation: string | null; motorcycleModel: string | null
  resolution: string | null; resolvedAt: string | null; closedAt: string | null
  lastVisibleUpdateAt: string; updates: PublicUpdate[]
}
export function listOwnTickets(page: number, status: string, ticketId: string) {
  const query = new URLSearchParams({ page: String(page), limit: '10' })
  if (status) query.set('status', status)
  if (ticketId) query.set('ticketId', ticketId)
  return apiRequest<TrackingTicket[]>(`/me/tickets?${query}`)
}
export async function getOwnTicket(id: number) {
  return (await apiRequest<TrackingTicket>(`/me/tickets/${id}`)).data
}
