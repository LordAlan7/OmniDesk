import { apiPage } from '@/api/http'

export interface AuditRecord {
  id: number
  action: string
  entity: string
  entityId: number | null
  actorId: number | null
  outcome: 'applied' | 'rejected'
  correlationId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AuditEventInfo {
  action: string
  entity: string
  module: string
  description: string
  outcome: 'applied' | 'rejected'
  implemented: boolean
}

export interface AuditFilters {
  entity?: string
  entityId?: string
  action?: string
  actorId?: string
  outcome?: '' | 'applied' | 'rejected'
  correlationId?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

/** datetime-local (hora del navegador) → instante ISO con zona. */
function toIso(value: string): string {
  return new Date(value).toISOString()
}

export function listAudit(filters: AuditFilters = {}) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 20),
  })

  for (const key of ['entity', 'entityId', 'action', 'actorId', 'outcome', 'correlationId'] as const) {
    const value = filters[key]?.trim()
    if (value) params.set(key, value)
  }

  if (filters.from) params.set('from', toIso(filters.from))
  if (filters.to) params.set('to', toIso(filters.to))

  return apiPage<AuditRecord[]>(`/audit-logs?${params.toString()}`)
}

export async function getAuditCatalog(): Promise<AuditEventInfo[]> {
  const response = await apiPage<AuditEventInfo[]>('/audit-logs/catalog')
  return response.data
}

/** Fecha con zona horaria identificable (p. ej. "21/10/2026, 14:05:09 GMT-6"). */
export function formatDateTimeWithZone(value: string): string {
  return new Date(value).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
}
