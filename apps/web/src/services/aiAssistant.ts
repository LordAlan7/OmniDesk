import { apiPage } from '@/api/http'

/**
 * Servicio del Asistente de IA (AIR-001) y de revisión humana (AIR-004).
 *
 * El frontend solo envía `question` y, opcionalmente, `ticketId` cuando el panel
 * se abre desde el detalle del ticket (decisión 4 del usuario). TODO lo demás
 * (permisos, fuentes autorizadas, proveedor, modelo, revisión, aplicación)
 * lo decide el backend.
 */

export type AssistantStatus = 'answered' | 'insufficient_information' | 'needs_more_info' | 'out_of_scope'
export type AITransparencyStatus =
  | 'supported'
  | 'needs_more_info'
  | 'insufficient_support'
  | 'out_of_scope'
  | 'technical_error'

export interface AITransparency {
  status: AITransparencyStatus
  title: string
  message: string
  requiresHumanReview: boolean
  missingInformation: string[]
}

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
  transparency?: AITransparency
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

// ──────────────────────────────────────────────────────────────────────────
// AIR-004: revisión humana de recomendaciones.
// ──────────────────────────────────────────────────────────────────────────

export type ReviewDecision = 'approved' | 'rejected' | 'needs_more_info'

export interface ReviewResult {
  id: number
  interactionId: number
  decision: ReviewDecision
  reviewerId: number
  reviewedAt: string
  supersedesId: number | null
  followUp: AssistantAnswer | null
}

/**
 * Registra la decisión de revisión sobre una interacción. Si la decisión es
 * `needs_more_info`, el backend dispara una nueva consulta con la aclaración
 * y devuelve `followUp` con la nueva interacción. La decisión es mutable:
 * llamar de nuevo con otra decisión pisa la anterior (D3).
 */
export async function reviewInteraction(
  interactionId: number,
  decision: ReviewDecision,
  reason: string,
): Promise<ReviewResult> {
  return (
    await apiPage<ReviewResult>(`/ai/interactions/${interactionId}/review`, {
      method: 'POST',
      body: { decision, reason },
    })
  ).data
}

export interface ApplyInvestigationContent {
  activity: string
  result: string
  knowledgeArticleId?: number
}

export interface ApplyResolutionContent {
  resolution: string
  resolutionVerification: string
  rootCause?: string
  observations?: string
  knowledgeArticleId?: number
}

export interface ApplyResult {
  applied: true
  target: 'investigation' | 'resolution'
  investigationId?: number
  ticketId: number
  ticketVersion?: number
}

/**
 * Aplica la recomendación aprobada al ticket. El backend valida que la
 * revisión vigente sea `approved` y delega el guardado en FR-009
 * (addInvestigation o resolveTicket). El contenido lo arma el frontend
 * a partir de la recomendación, pero el técnico lo puede editar antes
 * de confirmar (AIR-006: validación humana antes de guardar como final).
 */
export async function applyInteraction(
  interactionId: number,
  target: 'investigation',
  ticketId: number,
  content: ApplyInvestigationContent,
): Promise<ApplyResult>
export async function applyInteraction(
  interactionId: number,
  target: 'resolution',
  ticketId: number,
  content: ApplyResolutionContent,
  expectedVersion: number,
): Promise<ApplyResult>
export async function applyInteraction(
  interactionId: number,
  target: 'investigation' | 'resolution',
  ticketId: number,
  content: ApplyInvestigationContent | ApplyResolutionContent,
  expectedVersion?: number,
): Promise<ApplyResult> {
  const body: Record<string, unknown> = { target, ticketId, content }
  if (target === 'resolution' && expectedVersion !== undefined) {
    body.expectedVersion = expectedVersion
  }
  return (await apiPage<ApplyResult>(`/ai/interactions/${interactionId}/apply`, { method: 'POST', body })).data
}
export interface TicketSuggestion {
  title: string;
  description: string;
  categoryName: string | null;
  storeLocation: string | null;
  motorcycleModel: string | null;
  missingInformation: string[];
}

export async function suggestTicketFields(description: string): Promise<TicketSuggestion> {
  // 1. apiPage ya nos devuelve el objeto con { data: ... }
  const response = await apiPage<TicketSuggestion>('/ai/ticket-suggestions', {
    method: 'POST',
    body: { description },
  })

  // 2. Por lo tanto, retornamos directamente response.data
  return response.data
}