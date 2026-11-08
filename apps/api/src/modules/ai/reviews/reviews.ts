import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';

/**
 * Revisiones humanas de recomendaciones de IA (AIR-004).
 *
 * Decisiones del usuario (confirmadas en el chat):
 *  - D1: Aprueban Technician + Service Advisor + Manager; sólo Manager rechaza.
 *  - D2: needs_more_info dispara una nueva consulta al asistente con la aclaración.
 *  - D3: La decisión se puede cambiar (la revisión es mutable; cada cambio se audita).
 *  - D4: Para aplicar, la última revisión debe estar 'approved'.
 *
 * BR-010 / BR-011: la responsabilidad humana es la decisión explícita. Abrir la
 * recomendación NO la aprueba; se requiere el botón + motivo. El sistema NO
 * verifica que el revisor leyó el contenido: registra que se tomó la decisión.
 *
 * Almacén en memoria (decisión 3 del usuario). Una revisión por interacción,
 * mutable: si se cambia la decisión, se sobrescribe y se audita de nuevo.
 * La persistencia en PostgreSQL llega con FR-015.
 */
export type ReviewDecision = 'approved' | 'rejected' | 'needs_more_info';

export interface AiReview {
  id: number;
  interactionId: number;
  reviewerId: number;
  decision: ReviewDecision;
  /** Motivo obligatorio (5..2000). Para 'needs_more_info' se usa como aclaración. */
  reason: string;
  /** Si decision='needs_more_info', id de la interacción generada como seguimiento. */
  followUpInteractionId?: number;
  /** Id de la revisión anterior, si esta sobrescribió una decisión previa (D3). */
  supersedesId?: number;
  reviewedAt: string;
}

const byId = new Map<number, AiReview>();
let nextId = 1;

/** Índice interactionId → id de la revisión vigente (la última). */
const activeByInteraction = new Map<number, number>();

/**
 * Registra o actualiza la revisión de una interacción.
 *
 * Si la interacción ya tenía una revisión vigente y se llama de nuevo con otra
 * decisión, la nueva "pisa" a la anterior (D3: la decisión se puede cambiar).
 * La revisión anterior se conserva en `byId` para auditoría/historial.
 */
export function recordReview(input: Omit<AiReview, 'id' | 'reviewedAt'>): AiReview {
  const review: AiReview = {
    ...input,
    id: nextId++,
    reviewedAt: new Date().toISOString(),
  };

  const previousActiveId = activeByInteraction.get(input.interactionId);
  if (previousActiveId !== undefined) {
    review.supersedesId = previousActiveId;
  }

  byId.set(review.id, review);
  activeByInteraction.set(input.interactionId, review.id);
  return review;
}

/** Marca el follow-up generado por un 'needs_more_info'. */
export function attachFollowUp(reviewId: number, followUpInteractionId: number): void {
  const review = byId.get(reviewId);
  if (!review) throw Errors.notFound('Review');
  review.followUpInteractionId = followUpInteractionId;
}

/** Devuelve la revisión vigente de una interacción (o undefined). */
export function getActiveReviewForInteraction(interactionId: number): AiReview | undefined {
  const id = activeByInteraction.get(interactionId);
  if (id === undefined) return undefined;
  return byId.get(id);
}

/** Devuelve el historial completo de revisiones de una interacción (auditoría/debug). */
export function listReviewsForInteraction(interactionId: number): AiReview[] {
  return [...byId.values()]
    .filter((r) => r.interactionId === interactionId)
    .sort((a, b) => a.id - b.id);
}

export function resetReviews(): void {
  byId.clear();
  activeByInteraction.clear();
  nextId = 1;
}

/**
 * ¿La decisión la puede tomar este usuario? (D1)
 *  - approved / needs_more_info: Technician, Service Advisor, Manager (ai:validate).
 *  - rejected: sólo Manager (rol superior — decisión 4 del usuario).
 *
 * La verificación de `ai:validate` ya la hace requirePermission en la ruta;
 * aquí sólo restringimos el 'rejected' a Manager.
 */
export function canTakeDecision(user: AuthUser, decision: ReviewDecision): void {
  if (decision === 'rejected' && !user.roles.includes('Manager')) {
    throw Errors.forbidden('Sólo un Manager puede rechazar una recomendación de IA.');
  }
}