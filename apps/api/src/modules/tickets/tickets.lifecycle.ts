import { Errors } from '../../shared/errors';
import { ticketsRepository} from './tickets.repository';
import type { Ticket } from './tickets.types';

/** Pendiente = cualquier ticket asignado que todavía no esté cerrado. */
export async function hasPendingTicketsForTechnician(
  technicianId: number,
): Promise<boolean> {
  const tickets = await ticketsRepository.list({ visibleTo: null });
  return tickets.some(
    (t: Ticket) =>
      t.assignedTechnicianId === technicianId && t.status !== 'Closed',
  );
}

/**
 * Verifica que un ticket cumpla las reglas condicionales de su estado (NFR-010).
 * Se llama ANTES de persistir cualquier cambio (en save).
 * Lanza 409 (INVALID_STATE) si hay inconsistencia.
 */
export function assertStatusInvariants(ticket: Ticket): void {
  if (ticket.status === 'Resolved' && !ticket.resolution) {
    throw Errors.invalidState(
      'Un ticket en "Resolved" requiere que la resolución esté registrada.',
    );
  }

  // FR-009: la comprobación del resultado es obligatoria al resolver. La restricción
  // también existe a nivel DB (tickets_resolved_requires_verification) como defensa
  // en profundidad (NFR-010).
  if (ticket.status === 'Resolved' && !ticket.resolutionVerification) {
    throw Errors.invalidState(
      'Un ticket en "Resolved" requiere que la comprobación del resultado esté registrada.',
    );
  }

  if (ticket.status === 'Closed' && !ticket.closedAt) {
    throw Errors.invalidState(
      'Un ticket en "Closed" requiere la fecha de cierre.',
    );
  }

  if (ticket.status === 'Open' && ticket.assignedTechnicianId !== null) {
    throw Errors.invalidState(
      'Un ticket en "Open" no puede tener técnico asignado.',
    );
  }

  if (
    ticket.status !== 'Open' &&
    ticket.assignedTechnicianId === null
  ) {
    throw Errors.invalidState(
      `Un ticket en "${ticket.status}" requiere un técnico asignado.`,
    );
  }
}

export function canReclassify(ticket: Ticket): void {
  if (ticket.status === 'Closed') {
    throw Errors.invalidState('No se puede cambiar la categoría de un ticket cerrado.');
  }
}

// ──────────────────────────────────────────────────────────────────────────
// FR-009: hook de validación de referencias a artículos de conocimiento (FR-011).
// ──────────────────────────────────────────────────────────────────────────
// Inyección de dependencia para romper el ciclo tickets → knowledge → files → tickets.
// Mismo patrón que configurePendingTicketsChecker: app.ts (raíz de composición) inyecta
// la implementación concreta de knowledge al módulo tickets. Así tickets no importa
// knowledge, y el test de arquitectura (architecture.test.ts) sigue pasando sin ciclo.

type ArticleReferenceChecker = (
  articleId: number,
) => Promise<{ id: number; title: string } | null>;

let checkApprovedArticle: ArticleReferenceChecker | undefined;

export function configureArticleReferenceChecker(
  checker: ArticleReferenceChecker,
): void {
  checkApprovedArticle = checker;
}

/**
 * Valida que un `knowledgeArticleId` apunte a un artículo aprobado y existente.
 * Lanza notFound si no existe, validation si no está aprobado.
 * Devuelve `{ id, title }` para que el caller pueda, opcionalmente, incluir el
 * título en la respuesta (sin copiar el contenido del artículo).
 */
export async function resolveApprovedArticleReference(
  articleId: number | undefined,
): Promise<{ id: number; title: string } | null> {
  if (articleId === undefined || articleId === null) return null;

  if (!checkApprovedArticle) {
    throw new Error(
      'No está configurado el validador de referencias a artículos de conocimiento.',
    );
  }

  const article = await checkApprovedArticle(articleId);

  if (!article) {
    throw Errors.notFound('Knowledge article');
  }

  return article;
}
