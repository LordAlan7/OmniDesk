import { apiPage } from '@/api/http'

/**
 * Servicio del Asistente de IA (AIR-001).
 *
 * El frontend solo envía `question` y, opcionalmente, `ticketId` cuando el panel
 * se abre desde el detalle del ticket (decisión 4 del usuario). TODO lo demás
 * (permisos, fuentes autorizadas, proveedor, modelo) lo decide el backend.
 */

export type AssistantStatus = 'answered' | 'insufficient_information'

export interface AssistantReference {
  authorizationId: number
  sourceType: 'article' | 'document'
  sourceId: number
  sourceVersion: string
  title: string
  chunkIndex: number
}

export interface AssistantAnswer {
  id: number
  status: AssistantStatus
  answer: string
  references: AssistantReference[]
  aiGenerated: true
  createdAt: string
}

export type InteractionView =
  | { status: 'available'; interaction: AssistantAnswer & { userId: number } }
  | { status: 'unavailable'; id: number; reason: 'source_withdrawn' | 'source_access_lost'; createdAt: string }

/**
 * Llama al asistente. Devuelve la interacción (con id) que el usuario puede
 * reabrir más tarde desde `/ai/interactions/:id`.
 */
export async function askAssistant(
  question: string,
  ticketId?: number,
): Promise<AssistantAnswer> {
  const body: { question: string; ticketId?: number } = { question }
  if (ticketId !== undefined) body.ticketId = ticketId
  return (await apiPage<AssistantAnswer>('/ai/ask', { method: 'POST', body })).data
}

/** Reabre una interacción propia. El backend revalida cada referencia. */
export async function getInteraction(id: number): Promise<InteractionView> {
  return (await apiPage<InteractionView>(`/ai/interactions/${id}`)).data
}