/**
 * Módulo AI - AI Assistant + AI Validation & Review
 * Requisitos: FR-013, FR-014, FR-015, FR-021, NFR-003, AIR-004
 * Dependencias permitidas: audit (módulo hoja)
 * Paso 8: tickets, knowledge e inventory solo vía puertos inyectados (ai.ports.ts)
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { aiRouter } from './ai.routes';
export type { AIProvider, AIAnswer } from './providers/ai-provider';
export { createAIProvider } from './providers';

// Paso 8 (servicio de IA separable): frontera con puertos inyectados.
// app.ts (raíz de composición) llama configureAiPorts() con los adaptadores reales.
export { configureAiPorts, resetAiPorts } from './ai.ports';
export type { AiPorts, TicketsPort, KnowledgePort, InventoryPort } from './ai.ports';

// AIR-002: fuentes de conocimiento autorizadas y recuperación filtrada.
export { askWithAuthorizedSources, INSUFFICIENT_INFORMATION } from './ai.service';
export { retrieveAuthorizedContext } from './sources/retrieval';
export { referenceStatus } from './sources/sources.service';
export type { AuthorizedAnswer } from './ai.service';
export type { SourceReference } from './sources/sources.types';

// AIR-008: contexto de ticket filtrado e interacciones con acceso por dueño.
export { buildTicketContext } from './context/ticket-context';
export {
  getInteractionForUser,
  recordInteraction,
  getInteractionById,
} from './interactions/interactions';

// AIR-004: revisión humana de recomendaciones (almacén en memoria).
export {
  recordReview,
  getActiveReviewForInteraction,
  attachFollowUp,
  listReviewsForInteraction,
  canTakeDecision,
  resetReviews,
} from './reviews/reviews';
export type { AiReview, ReviewDecision } from './reviews/reviews';