import { ApiError, apiRequest } from './api'

export type TicketStatus =
  | 'Open'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Closed'

export interface Ticket {
  id: number
  title: string
  description: string
  storeLocation?: string | null
  motorcycleModel?: string | null
  categoryId: number
  priorityId: number | null
  status: TicketStatus
  createdBy: number
  assignedTechnicianId: number | null
  assignedTechnicianName?: string | null
  dueDate: string | null
  /** Calculado por el servidor (FR-008): plazo vencido en un ticket aún en seguimiento. */
  isOverdue?: boolean
  resolution: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
  version: number
}

export interface TechnicianCandidate {
  id: number
  name: string
}

export interface TicketHistoryEntry {
  id: number
  ticketId: number
  actorId: number
  action: string
  from?: unknown
  to?: unknown
  reason?: string | null
  /** Autor resuelto por el servidor (solo historial interno). */
  actorName?: string | null
  correlationId?: string | null
  createdAt: string
}

export interface AssignmentInput {
  technicianId: number
  expectedVersion: number
  reason?: string
}

export function listTickets(
  page = 1,
  limit = 10,
  status?: TicketStatus,
  overdue?: boolean,
) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (status) {
    query.set('status', status)
  }

  if (overdue !== undefined) {
    query.set('overdue', String(overdue))
  }

  return apiRequest<Ticket[]>(`/tickets?${query.toString()}`)
}

export async function getTicket(id: number): Promise<Ticket> {
  const response = await apiRequest<Ticket>(`/tickets/${id}`)
  return response.data
}

export async function getEligibleTechnicians(
  ticketId: number,
): Promise<TechnicianCandidate[]> {
  const response = await apiRequest<TechnicianCandidate[]>(
    `/tickets/${ticketId}/eligible-technicians`,
  )

  return response.data
}

export async function assignTechnician(
  ticketId: number,
  input: AssignmentInput,
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(
    `/tickets/${ticketId}/assignment`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )

  return response.data
}

export async function getTicketHistory(
  ticketId: number,
): Promise<TicketHistoryEntry[]> {
  const response = await apiRequest<TicketHistoryEntry[]>(
    `/tickets/${ticketId}/history`,
  )

  return response.data
}
export interface AvailableTransition {
  to: TicketStatus
  via: 'status' | 'resolution' | 'close'
  requiresResolution?: boolean
}

export async function getAvailableTransitions(
  ticketId: number,
): Promise<AvailableTransition[]> {
  const response = await apiRequest<AvailableTransition[]>(
    `/tickets/${ticketId}/available-transitions`,
  )

  return response.data
}

/** Ejecuta una transición usando el endpoint que corresponde (estado, resolución o cierre). */
export async function runTransition(
  ticketId: number,
  transition: AvailableTransition,
  input: { expectedVersion: number; resolution?: string },
): Promise<Ticket> {
  const request =
    transition.via === 'resolution'
      ? { path: 'resolution', body: { resolution: input.resolution ?? '' } }
      : transition.via === 'close'
        ? { path: 'close', body: {} }
        : {
            path: 'status',
            body: { status: transition.to, expectedVersion: input.expectedVersion },
          }

  const response = await apiRequest<Ticket>(
    `/tickets/${ticketId}/${request.path}`,
    {
      method: transition.via === 'status' ? 'PATCH' : 'POST',
      body: JSON.stringify(request.body),
    },
  )

  return response.data
}

export async function setTicketDeadline(
  ticketId: number,
  input: { dueDate: string | null; expectedVersion: number; reason: string },
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(
    `/tickets/${ticketId}/deadline`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )

  return response.data
}

export async function addProgressUpdate(
  ticketId: number,
  note: string,
): Promise<TicketHistoryEntry> {
  const response = await apiRequest<TicketHistoryEntry>(
    `/tickets/${ticketId}/progress-updates`,
    { method: 'POST', body: JSON.stringify({ note }) },
  )

  return response.data
}

export interface Category {
  id: number
  name: string
}

export interface CreateTicketPayload {
  title: string
  description: string
  categoryId: number
  storeLocation: string
  motorcycleModel: string
}


export const getCategories = () => apiRequest<Category[]>('/ticket-categories')

export async function createTicket(payload: CreateTicketPayload) {
  // Generamos una clave única para esta petición.
  // Si el usuario hace doble clic, la segunda petición enviará la misma clave
  // y el backend devolverá el ticket ya creado en lugar de hacer uno nuevo.
  const idempotencyKey = crypto.randomUUID()

  return apiRequest<Ticket>('/tickets', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  })
}


export async function changeTicketCategory(id: number, categoryId: number): Promise<void> {
  await apiRequest(`/tickets/${id}/category`, {
    method: 'PATCH',
    body: JSON.stringify({ categoryId }),
  })
}

export async function updateBusinessInformation(
  id: number,
  input: { storeLocation?: string; motorcycleModel?: string; version: number },
): Promise<void> {
  await apiRequest(`/tickets/${id}/business-information`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export interface Priority {
  id: number
  name: string
  description: string
  sortOrder: number
}

export interface PriorityInput {
  priorityId: number
  expectedVersion: number
  reason?: string
}

export async function getPriorities(): Promise<Priority[]> {
  const response = await apiRequest<Priority[]>('/ticket-priorities')
  return response.data
}

export async function updatePriority(
  ticketId: number,
  input: PriorityInput,
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(
    `/tickets/${ticketId}/priority`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )
  return response.data
}

export interface TicketAttachment {
  id: number
  ticketId: number
  uploadedBy: number
  uploadedByName: string
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export async function getAttachments(ticketId: number): Promise<TicketAttachment[]> {
  const response = await apiRequest<TicketAttachment[]>(`/tickets/${ticketId}/attachments`)
  return response.data
}

export async function uploadAttachment(ticketId: number, file: File): Promise<TicketAttachment> {
  const formData = new FormData()
  formData.append('file', file)
  
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '')
  const token = sessionStorage.getItem('omnidesk.token')
  
  const res = await fetch(`${base}/tickets/${ticketId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new ApiError(error.error?.message || 'Error al subir archivo', res.status)
  }
  
  return (await res.json()).data
}

export async function getAttachmentUrl(ticketId: number, attachmentId: number): Promise<string> {
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '')
  const token = sessionStorage.getItem('omnidesk.token')
  
  const res = await fetch(`${base}/tickets/${ticketId}/attachments/${attachmentId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  
  if (!res.ok) throw new ApiError('Error al descargar', res.status)
  
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}