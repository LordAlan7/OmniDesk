
import { api } from '@/api/http'

/**
 * FR-016: estadísticas generales del panel.
 */
export interface OverviewMetrics {
  total: number
  open: number
  assigned: number
  inProgress: number
  resolved: number
  closed: number
  overdue: number
  unassigned: number
  withoutPriority: number
  byPriority: {
    priorityId: number | null
    total: number
  }[]
  generatedAt: string
}

/**
 * Carga de trabajo por técnico.
 */
export interface TechnicianWorkload {
  technicianId: number
  pendingTickets: number
}

export interface WorkloadResponse {
  technicians: TechnicianWorkload[]
  generatedAt: string
}

/**
 * Información de los tickets del reporte.
 */
export interface ReportTicket {
  id: number
  title: string
  status: string
  priorityId: number | null
  technicianId: number | null
  createdAt: string
  dueDate: string | null
}

export interface ReportTicketsResponse {
  total: number
  items: ReportTicket[]
  limit: number
  offset: number
  generatedAt: string
}

export interface ReportTicketFilters {
  status?: string
  priorityId?: number
  technicianId?: number
  from?: string
  to?: string
  limit?: number
  offset?: number
}

/**
 * Obtener estadísticas generales.
 */
export function getSupportOverview(): Promise<OverviewMetrics> {
  return api<OverviewMetrics>('/reports/overview')
}

/**
 * Obtener carga de trabajo por técnico.
 */
export function getSupportWorkload(): Promise<WorkloadResponse> {
  return api<WorkloadResponse>('/reports/workload')
}

/**
 * Consultar tickets con filtros y paginación.
 */
export function getSupportTickets(
  filters: ReportTicketFilters = {},
): Promise<ReportTicketsResponse> {
  const params = new URLSearchParams()

  if (filters.status) {
    params.set('status', filters.status)
  }

  if (filters.priorityId !== undefined) {
    params.set('priorityId', String(filters.priorityId))
  }

  if (filters.technicianId !== undefined) {
    params.set('technicianId', String(filters.technicianId))
  }

  if (filters.from) {
    params.set('from', filters.from)
  }

  if (filters.to) {
    params.set('to', filters.to)
  }

  params.set('limit', String(filters.limit ?? 10))
  params.set('offset', String(filters.offset ?? 0))

  return api<ReportTicketsResponse>(
    `/reports/tickets?${params.toString()}`
  )
}

/**
 * FR-016: actividad diaria de ticket_history.
 */
export interface DailyTicketActivity {
  date: string
  activities: number
  tickets: number
}

export interface ActivityResponse {
  days: DailyTicketActivity[]
  generatedAt: string
}

export interface ActivityFilters {
  from?: string
  to?: string
}

/**
 * Consultar actividad por periodo.
 */
export function getSupportActivity(
  filters: ActivityFilters = {},
): Promise<ActivityResponse> {
  const params = new URLSearchParams()

  if (filters.from) {
    params.set('from', filters.from)
  }

  if (filters.to) {
    params.set('to', filters.to)
  }

  const query = params.toString()

  return api<ActivityResponse>(
    `/reports/activity${query ? `?${query}` : ''}`
  )
}
