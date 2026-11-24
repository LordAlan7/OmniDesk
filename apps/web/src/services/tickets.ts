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
  /** Paso 6: moto del inventario vinculada (el backend ya devuelve esta copia mínima). */
  vehicleVin?: string | null
  vehicleModelId?: string | null
  vehicleBrand?: string | null
  vehicleModel?: string | null
  vehicleYear?: number | null
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
  /** FR-009: comprobación del resultado (visible solo a staff, no al solicitante). */
  resolutionVerification?: string | null
  rootCause?: string | null
  resolutionObservations?: string | null
  knowledgeArticleId?: number | null
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

export interface AvailableTransition {
  to: TicketStatus
  via: 'status' | 'resolution' | 'close'
  requiresResolution?: boolean
}

/** FR-009: actividad de investigación registrada por un técnico. */
export interface TicketInvestigation {
  id: number
  ticketId: number
  authorId: number
  authorName?: string | null
  activity: string
  result: string
  knowledgeArticleId: number | null
  knowledgeArticleTitle?: string | null
  createdAt: string
}

/** FR-009: input para registrar una actividad de investigación. */
export interface InvestigationInput {
  activity: string
  result: string
  knowledgeArticleId?: number
}

/** FR-009: input para resolver un ticket (campos ampliados). */
export interface ResolutionInput {
  resolution: string
  resolutionVerification: string
  rootCause?: string
  observations?: string
  knowledgeArticleId?: number
}

/** FR-009: input para reabrir un ticket resuelto. */
export interface ReopenInput {
  reason: string
  expectedVersion: number
}

/** FR-011: artículo de conocimiento aprobado, para el dropdown de referencias. */
export interface KnowledgeArticleOption {
  id: number
  title: string
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

export async function getAvailableTransitions(
  ticketId: number,
): Promise<AvailableTransition[]> {
  const response = await apiRequest<AvailableTransition[]>(
    `/tickets/${ticketId}/transitions`,
  )

  return response.data
}

/**
 * Ejecuta una transición usando el endpoint que corresponde.
 * FR-009: si la transición es Resolved → In Progress (reapertura), llama a /reopen
 * con motivo obligatorio en lugar de /status.
 */
export async function runTransition(
  ticketId: number,
  transition: AvailableTransition,
  input: {
    expectedVersion: number
    resolution?: ResolutionInput
    reason?: string
  },
  currentStatus: TicketStatus,
): Promise<Ticket> {
  // Detectar reapertura: Resolved → In Progress. El motivo es obligatorio.
  const isReopen =
    currentStatus === 'Resolved' &&
    transition.to === 'In Progress' &&
    transition.via === 'status'

  if (isReopen) {
    if (!input.reason || !input.reason.trim()) {
      throw new ApiError('El motivo de reapertura es obligatorio.', 400)
    }
    const response = await apiRequest<Ticket>(
      `/tickets/${ticketId}/reopen`,
      {
        method: 'POST',
        body: JSON.stringify({
          reason: input.reason.trim(),
          expectedVersion: input.expectedVersion,
        }),
      },
    )
    return response.data
  }

  if (transition.via === 'resolution') {
    if (!input.resolution) {
      throw new ApiError('Falta la resolución.', 400)
    }
    const response = await apiRequest<Ticket>(
      `/tickets/${ticketId}/resolution`,
      {
        method: 'POST',
        body: JSON.stringify(input.resolution),
      },
    )
    return response.data
  }

  if (transition.via === 'close') {
    const response = await apiRequest<Ticket>(`/tickets/${ticketId}/close`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    return response.data
  }

  // Transición de estado común (no reapertura).
  const response = await apiRequest<Ticket>(`/tickets/${ticketId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: transition.to,
      expectedVersion: input.expectedVersion,
    }),
  })
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
  /** Paso 10: VIN opcional; el backend lo valida contra inventario y guarda la copia mínima. */
  vehicleVin?: string
}

// Etiquetas en español usadas por las vistas del NFR-006.
export const TICKET_PRIORITIES = [
  { id: 1, name: 'Baja' },
  { id: 2, name: 'Media' },
  { id: 3, name: 'Alta' },
  { id: 4, name: 'Crítica' },
] as const

export const getCategories = () => apiRequest<Category[]>('/ticket-categories')

export async function createTicket(payload: CreateTicketPayload) {
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

// Compatibilidad con NFR-006. FR-009 mantiene sus reglas de validación.
// La reapertura no puede hacerse sin motivo: debe utilizarse reopenTicket().
export async function changeTicketStatus(
  id: number,
  status: TicketStatus,
): Promise<Ticket> {
  const current = await getTicket(id)
  if (current.status === 'Resolved' && status === 'In Progress') {
    throw new ApiError(
      'Para reabrir un ticket debes indicar el motivo. Utiliza la acción de reapertura.',
      400,
    )
  }
  const response = await apiRequest<Ticket>(`/tickets/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, expectedVersion: current.version }),
  })
  return response.data
}

// FR-009 exige resolutionVerification. No se debe inventar una verificación.
// La vista debe capturarla y llamar a runTransition() con ResolutionInput.
export async function resolveTicket(
  _id: number,
  _resolution: string,
): Promise<Ticket> {
  throw new ApiError(
    'La resolución requiere describir la verificación. Actualiza el formulario para FR-009.',
    400,
  )
}

// Mantener el selector anterior mientras se adapta la vista a prioridades enriquecidas.
export async function updateTicketPriority(
  id: number,
  priorityId: number,
): Promise<Ticket> {
  const current = await getTicket(id)
  return updatePriority(id, {
    priorityId,
    expectedVersion: current.version,
  })
}

// =============================================================================
// FR-009: Investigación, resolución y cierre
// =============================================================================

/** FR-009: lista las investigaciones de un ticket. */
export async function listInvestigations(
  ticketId: number,
): Promise<TicketInvestigation[]> {
  const response = await apiRequest<TicketInvestigation[]>(
    `/tickets/${ticketId}/investigations`,
  )
  return response.data
}

/** FR-009: registra una actividad de investigación. */
export async function addInvestigation(
  ticketId: number,
  input: InvestigationInput,
): Promise<TicketInvestigation> {
  const response = await apiRequest<TicketInvestigation>(
    `/tickets/${ticketId}/investigations`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return response.data
}

/** FR-009: reabre un ticket resuelto (motivo obligatorio). */
export async function reopenTicket(
  ticketId: number,
  input: ReopenInput,
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(`/tickets/${ticketId}/reopen`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.data
}

/**
 * FR-011: lista artículos de conocimiento aprobados para usar como referencia
 * en investigaciones y resoluciones. El backend ya filtra a 'approved' para
 * usuarios sin permiso de publicación (Technician, Service Advisor, Employee).
 */
export async function listApprovedKnowledgeArticles(): Promise<KnowledgeArticleOption[]> {
  const response = await apiRequest<KnowledgeArticleOption[]>(
    '/knowledge/articles?limit=100',
  )
  return response.data
}
