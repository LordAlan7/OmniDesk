
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
  actorName?: string | null
  correlationId?: string | null
  createdAt: string
}

export interface AssignmentInput {
  technicianId: number
  expectedVersion: number
  reason?: string
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

// Prioridades visibles en la interfaz.
export const TICKET_PRIORITIES = [
  { id: 1, name: 'Baja' },
  { id: 2, name: 'Media' },
  { id: 3, name: 'Alta' },
  { id: 4, name: 'Crítica' },
] as const

// Consulta de tickets con filtro de vencimiento FR-008.
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

  return apiRequest<Ticket[]>(
    `/tickets?${query.toString()}`,
  )
}

export async function getTicket(
  id: number,
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(
    `/tickets/${id}`,
  )

  return response.data
}

export async function getEligibleTechnicians(
  ticketId: number,
): Promise<TechnicianCandidate[]> {
  const response =
    await apiRequest<TechnicianCandidate[]>(
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
  const response =
    await apiRequest<TicketHistoryEntry[]>(
      `/tickets/${ticketId}/history`,
    )

  return response.data
}

// FR-008: transiciones permitidas por el backend.
export interface AvailableTransition {
  to: TicketStatus
  via: 'status' | 'resolution' | 'close'
  requiresResolution?: boolean
}

export async function getAvailableTransitions(
  ticketId: number,
): Promise<AvailableTransition[]> {
  const response =
    await apiRequest<AvailableTransition[]>(
      `/tickets/${ticketId}/available-transitions`,
    )

  return response.data
}

// FR-008: ejecutar cambios de estado.
export async function runTransition(
  ticketId: number,
  transition: AvailableTransition,
  input: {
    expectedVersion: number
    resolution?: string
  },
): Promise<Ticket> {
  const request =
    transition.via === 'resolution'
      ? {
          path: 'resolution',
          body: {
            resolution: input.resolution ?? '',
          },
        }
      : transition.via === 'close'
        ? {
            path: 'close',
            body: {},
          }
        : {
            path: 'status',
            body: {
              status: transition.to,
              expectedVersion: input.expectedVersion,
            },
          }

  const response = await apiRequest<Ticket>(
    `/tickets/${ticketId}/${request.path}`,
    {
      method:
        transition.via === 'status'
          ? 'PATCH'
          : 'POST',
      body: JSON.stringify(request.body),
    },
  )

  return response.data
}

// FR-008: configurar plazos de atención.
export async function setTicketDeadline(
  ticketId: number,
  input: {
    dueDate: string | null
    expectedVersion: number
    reason: string
  },
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(
    `/tickets/${ticketId}/deadline`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )

  return response.data
}

// FR-008: registrar avances del ticket.
export async function addProgressUpdate(
  ticketId: number,
  note: string,
): Promise<TicketHistoryEntry> {
  const response =
    await apiRequest<TicketHistoryEntry>(
      `/tickets/${ticketId}/progress-updates`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      },
    )

  return response.data
}

// Consultar categorías.
export const getCategories = () =>
  apiRequest<Category[]>('/ticket-categories')

// Crear ticket con idempotencia.
export async function createTicket(
  payload: CreateTicketPayload,
) {
  const idempotencyKey = crypto.randomUUID()

  return apiRequest<Ticket>('/tickets', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  })
}

// Actualizar categoría.
export async function changeTicketCategory(
  id: number,
  categoryId: number,
): Promise<void> {
  await apiRequest(
    `/tickets/${id}/category`,
    {
      method: 'PATCH',
      body: JSON.stringify({ categoryId }),
    },
  )
}

// Actualizar información comercial.
export async function updateBusinessInformation(
  id: number,
  input: {
    storeLocation?: string
    motorcycleModel?: string
    version: number
  },
): Promise<void> {
  await apiRequest(
    `/tickets/${id}/business-information`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )
}

// NFR-006: iniciar o reabrir trabajo.
export async function changeTicketStatus(
  id: number,
  status: TicketStatus,
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(
    `/tickets/${id}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  )

  return response.data
}

// NFR-006: registrar resolución.
export async function resolveTicket(
  id: number,
  resolution: string,
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(
    `/tickets/${id}/resolution`,
    {
      method: 'POST',
      body: JSON.stringify({
        resolution: resolution.trim(),
      }),
    },
  )

  return response.data
}

// NFR-006: compatibilidad con el formulario de prioridad.
export async function updateTicketPriority(
  id: number,
  priorityId: number,
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(
    `/tickets/${id}/priority`,
    {
      method: 'PATCH',
      body: JSON.stringify({ priorityId }),
    },
  )

  return response.data
}

// Gestión de prioridades enriquecidas de develop.
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
  const response = await apiRequest<Priority[]>(
    '/ticket-priorities',
  )

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

// Archivos adjuntos.
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

export async function getAttachments(
  ticketId: number,
): Promise<TicketAttachment[]> {
  const response =
    await apiRequest<TicketAttachment[]>(
      `/tickets/${ticketId}/attachments`,
    )

  return response.data
}

export async function uploadAttachment(
  ticketId: number,
  file: File,
): Promise<TicketAttachment> {
  const formData = new FormData()
  formData.append('file', file)

  const base = (
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000/api/v1'
  ).replace(/\/$/, '')

  const token = sessionStorage.getItem('omnidesk.token')

  const response = await fetch(
    `${base}/tickets/${ticketId}/attachments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    },
  )

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({}))

    throw new ApiError(
      error.error?.message || 'Error al subir archivo',
      response.status,
    )
  }

  return (await response.json()).data
}

export async function getAttachmentUrl(
  ticketId: number,
  attachmentId: number,
): Promise<string> {
  const base = (
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000/api/v1'
  ).replace(/\/$/, '')

  const token = sessionStorage.getItem('omnidesk.token')

  const response = await fetch(
    `${base}/tickets/${ticketId}/attachments/${attachmentId}/content`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!response.ok) {
    throw new ApiError(
      'Error al descargar',
      response.status,
    )
  }

  const blob = await response.blob()

  return URL.createObjectURL(blob)
}
