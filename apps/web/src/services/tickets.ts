import { apiRequest } from './api'

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
) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (status) {
    query.set('status', status)
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
