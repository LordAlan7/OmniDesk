import { apiRequest } from './api'

export interface Category {
  id: number
  name: string
}

export interface CreateTicketPayload {
  title: string
  description: string
  categoryId: number
  storeLocation?: string | null
  motorcycleModel?: string | null
}

export interface Ticket {
  id: number
  title: string
  description: string
  categoryId: number
  status: string
  storeLocation?: string | null
  motorcycleModel?: string | null
  createdAt: string
}

export const getCategories = () => apiRequest<Category[]>('/tickets/categories')

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