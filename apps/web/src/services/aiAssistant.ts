import { api, ApiError } from '@/api/http'

export type AssistantCondition = 'recommendation' | 'needs_more_info' | 'insufficient_support'

export interface AssistantReference {
  authorizationId: number
  sourceType: 'article' | 'document'
  sourceId: number
  sourceVersion: string
  title: string
  chunkIndex: number
}

export interface AssistantResult {
  interactionId: number
  condition: AssistantCondition
  aiGenerated: true
  requiresHumanReview: true
  message: string | null
  recommendation: string | null
  steps: string[]
  additionalInformation: string[]
  references: AssistantReference[]
  ticketId: number | null
}

export const MAX_QUESTION_LENGTH = 1000

/** FR-013: el cliente solo envía la pregunta y, opcionalmente, el ticket. El servidor decide permisos y contexto. */
export function askAssistant(question: string, ticketId?: number): Promise<AssistantResult> {
  return api<AssistantResult>('/ai/queries', {
    method: 'POST',
    body: ticketId === undefined ? { question } : { question, ticketId },
  })
}

/** Mensaje comprensible para el usuario; un fallo del servicio nunca se presenta como recomendación. */
export function assistantErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === 'AI_UNAVAILABLE') return cause.message
    if (cause.status === 429) return 'Hiciste demasiadas consultas seguidas. Espera un momento e inténtalo de nuevo.'
    if (cause.status === 403) return 'No tienes permiso para usar el asistente o este ticket como contexto.'
    if (cause.status === 404) return 'No se encontró el ticket o no tienes acceso a él.'
    if (cause.status === 400) return cause.details?.[0]?.message ?? 'La pregunta no es válida.'
    if (cause.kind === 'network') return cause.message
  }
  return 'No se pudo consultar al asistente. Puedes seguir consultando la biblioteca y los tickets manualmente.'
}
