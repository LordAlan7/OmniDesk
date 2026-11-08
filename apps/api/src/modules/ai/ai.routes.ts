import { Router } from 'express';
import { ok, parseId } from '../../shared/http';
import { PERMISSIONS, requirePermission } from '../../shared/authorization';
import { authenticate, currentUser } from '../../shared/security/guards';
import { recordAudit } from '../audit';
import { Errors } from '../../shared/errors';
import { askSchema } from './ai.schemas';
import { askWithAuthorizedSources, INSUFFICIENT_INFORMATION } from './ai.service';
import {
  getInteractionForUser,
  recordInteraction,
  getInteractionById,
} from './interactions/interactions';
import { aiSourcesRouter } from './sources/sources.routes';
import {
  recordReview,
  getActiveReviewForInteraction,
  attachFollowUp,
  canTakeDecision,
} from './reviews/reviews';
import { reviewSchema, applySchema } from './reviews/reviews.schemas';
import { addInvestigation, resolveTicket } from '../tickets';

export const aiRouter = Router();
const REQUIREMENTS = ['FR-013', 'FR-014', 'FR-015', 'FR-021', 'NFR-003'];

// AIR-002: fuentes autorizadas (la recuperación filtrada que usará el flujo RAG de FR-013).
aiRouter.use(aiSourcesRouter);

/**
 * AIR-001 — el asistente responde.
 */
aiRouter.post('/ai/ask', authenticate, requirePermission(PERMISSIONS.AI_QUERY), async (req, res, next) => {
  try {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      );
    }
    const { question, ticketId } = parsed.data;
    const user = currentUser(req);

    let answer;
    try {
      answer = await askWithAuthorizedSources(question, user, undefined, {
        ...(ticketId !== undefined ? { ticketId } : {}),
      });
    } catch (cause) {
      if (cause instanceof Error && 'status' in cause && (cause as { status: number }).status === 502) {
        recordAudit({
          action: 'ai.request_failed',
          entity: 'ai_interaction',
          entityId: null,
          actorId: user.id,
          metadata: {
            ticketId: ticketId ?? null,
            reason: 'provider_error',
          },
        });
      }
      throw cause;
    }

    const interaction = recordInteraction({
      userId: user.id,
      question,
      answer: answer.status === 'answered' ? answer.answer : answer.message,
      references: answer.references,
      ticketId: ticketId ?? null,
    });

    recordAudit({
      action: 'ai.suggestion_generated',
      entity: 'ai_interaction',
      entityId: interaction.id,
      actorId: user.id,
      metadata: {
        ticketId: ticketId ?? null,
        status: answer.status,
        references: answer.references.length,
      },
    });

    ok(
      res,
      {
        id: interaction.id,
        status: answer.status,
        answer: answer.status === 'answered' ? answer.answer : answer.message,
        references: answer.references,
        aiGenerated: true,
        createdAt: interaction.createdAt,
      },
      201,
    );
  } catch (cause) {
    next(cause);
  }
});

// Solo el dueño abre su interacción; las referencias se revalidan con los permisos actuales.
aiRouter.get('/ai/interactions/:id', authenticate, requirePermission(PERMISSIONS.AI_INTERACTIONS_READ), async (req, res, next) => {
  try {
    ok(res, await getInteractionForUser(parseId(req.params.id), currentUser(req)));
  } catch (cause) {
    next(cause);
  }
});

/**
 * AIR-004 — revisión humana de la recomendación.
 *
 * Reglas:
 *  - Permiso `ai:validate` (matriz: Technician, Service Advisor, Manager).
 *  - El revisor debe ser el dueño de la interacción (las interacciones son
 *    privadas; el flujo "rol superior revisa lo que otro preguntó" llega con
 *    FR-015, no en AIR-004).
 *  - decision='rejected' → sólo Manager (D1).
 *  - decision='needs_more_info' → dispara una nueva consulta al asistente con
 *    la aclaración (D2) y devuelve `followUpInteractionId`.
 *  - La revisión es mutable (D3): si ya existía, la nueva pisa a la anterior
 *    (supersedesId en metadata de auditoría) y se audita de nuevo.
 *  - Abrir la recomendación NO la aprueba: se exige decision + reason explícitos.
 *
 * Audita:
 *  - ai.suggestion_reviewed (siempre)
 *  - ai.suggestion_approved (si approved)
 *  - ai.suggestion_rejected (si rejected)
 */
aiRouter.post('/ai/interactions/:id/review', authenticate, requirePermission(PERMISSIONS.AI_VALIDATE), async (req, res, next) => {
  try {
    const interactionId = parseId(req.params.id);
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      );
    }
    const { decision, reason } = parsed.data;
    const user = currentUser(req);

    // El revisor debe ser el dueño de la interacción.
    const interaction = getInteractionById(interactionId);
    if (!interaction || interaction.userId !== user.id) {
      throw Errors.notFound('Interaction');
    }

    // D1: sólo Manager puede rechazar.
    canTakeDecision(user, decision);

    const previous = getActiveReviewForInteraction(interactionId);
    const review = recordReview({
      interactionId,
      reviewerId: user.id,
      decision,
      reason,
      supersedesId: previous?.id,
    });

    recordAudit({
      action: 'ai.suggestion_reviewed',
      entity: 'ai_validation',
      entityId: review.id,
      actorId: user.id,
      metadata: {
        interactionId,
        decision,
        supersedesId: review.supersedesId ?? null,
      },
    });

    if (decision === 'approved') {
      recordAudit({
        action: 'ai.suggestion_approved',
        entity: 'ai_validation',
        entityId: review.id,
        actorId: user.id,
        metadata: { interactionId, ticketId: interaction.ticketId ?? null },
      });
    } else if (decision === 'rejected') {
      recordAudit({
        action: 'ai.suggestion_rejected',
        entity: 'ai_validation',
        entityId: review.id,
        actorId: user.id,
        metadata: { interactionId, ticketId: interaction.ticketId ?? null },
      });
    }

    // D2: needs_more_info dispara una nueva consulta con la aclaración.
    let followUp: { id: number; answer: string; status: string } | null = null;
    if (decision === 'needs_more_info') {
      const followUpQuestion = `${interaction.question}\n\nAclaración del revisor: ${reason}`;
      const followUpAnswer = await askWithAuthorizedSources(
        followUpQuestion,
        user,
        undefined,
        interaction.ticketId !== null && interaction.ticketId !== undefined
          ? { ticketId: interaction.ticketId }
          : {},
      );

      const followUpInteraction = recordInteraction({
        userId: user.id,
        question: followUpQuestion,
        answer: followUpAnswer.status === 'answered' ? followUpAnswer.answer : followUpAnswer.message,
        references: followUpAnswer.references,
        ticketId: interaction.ticketId ?? null,
      });

      attachFollowUp(review.id, followUpInteraction.id);

      recordAudit({
        action: 'ai.suggestion_generated',
        entity: 'ai_interaction',
        entityId: followUpInteraction.id,
        actorId: user.id,
        metadata: {
          ticketId: interaction.ticketId ?? null,
          status: followUpAnswer.status,
          references: followUpAnswer.references.length,
          followUpOf: interactionId,
        },
      });

      followUp = {
        id: followUpInteraction.id,
        answer: followUpAnswer.status === 'answered' ? followUpAnswer.answer : followUpAnswer.message,
        status: followUpAnswer.status,
      };
    }

    ok(
      res,
      {
        id: review.id,
        interactionId,
        decision,
        reviewerId: review.reviewerId,
        reviewedAt: review.reviewedAt,
        supersedesId: review.supersedesId ?? null,
        followUp: followUp,
      },
      201,
    );
  } catch (cause) {
    next(cause);
  }
});

/**
 * AIR-004 + FR-009 — aplicar la recomendación aprobada al ticket.
 *
 * Reglas:
 *  - Permiso `ai:validate` + permisos de FR-009 (`tickets:update` para
 *    investigation; `tickets:resolve` para resolution).
 *  - La interacción debe existir y pertenecer al usuario.
 *  - La última revisión debe ser 'approved' (D4).
 *  - El guardado lo hace FR-009 (no se duplica lógica): se llama a
 *    `tickets.addInvestigation` o `tickets.resolveTicket`. Esos servicios
 *    revalidan acceso al ticket, estado, versiones y permisos vigentes.
 *  - No se ejecutan comandos externos, no se cierra el ticket (criterio:
 *    "Aceptar no ejecuta acciones ni declara resuelto el problema").
 *
 * Audita: ai.suggestion_applied con el id del recurso guardado (investigation
 * o ticket) y el tipo de destino. El contenido NO se persiste en auditoría.
 */
aiRouter.post('/ai/interactions/:id/apply', authenticate, requirePermission(PERMISSIONS.AI_VALIDATE), async (req, res, next) => {
  try {
    const interactionId = parseId(req.params.id);
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      );
    }
    const user = currentUser(req);

    // La interacción debe existir y ser del usuario.
    const interaction = getInteractionById(interactionId);
    if (!interaction || interaction.userId !== user.id) {
      throw Errors.notFound('Interaction');
    }

    // La última revisión debe ser 'approved'.
    const review = getActiveReviewForInteraction(interactionId);
    if (!review || review.decision !== 'approved') {
      throw Errors.invalidState(
        'La recomendación no está aprobada. Debe revisarse y aprobarse antes de aplicar.',
      );
    }

    // El ticketId del body debe coincidir con el de la interacción (anti-sustitución).
    if (interaction.ticketId !== null && interaction.ticketId !== undefined) {
      if (parsed.data.ticketId !== interaction.ticketId) {
        throw Errors.forbidden(
          'El ticketId no coincide con el de la interacción. No se puede aplicar a otro ticket.',
        );
      }
    }

    if (parsed.data.target === 'investigation') {
      // FR-009: addInvestigation valida tickets:update, acceso al ticket y estado.
      const investigation = await addInvestigation(
        parsed.data.ticketId,
        {
          activity: parsed.data.content.activity,
          result: parsed.data.content.result,
          knowledgeArticleId: parsed.data.content.knowledgeArticleId,
        },
        user,
      );

      recordAudit({
        action: 'ai.suggestion_applied',
        entity: 'ai_interaction',
        entityId: interactionId,
        actorId: user.id,
        metadata: {
          reviewId: review.id,
          ticketId: parsed.data.ticketId,
          target: 'investigation',
          investigationId: investigation.id,
        },
      });

      ok(res, { applied: true, target: 'investigation', investigationId: investigation.id, ticketId: parsed.data.ticketId }, 201);
    } else {
      // FR-009: resolveTicket valida tickets:resolve, acceso al ticket, estado
      // In Progress y expectedVersion.
      const ticket = await resolveTicket(
        parsed.data.ticketId,
        {
          resolution: parsed.data.content.resolution,
          resolutionVerification: parsed.data.content.resolutionVerification,
          rootCause: parsed.data.content.rootCause,
          observations: parsed.data.content.observations,
          knowledgeArticleId: parsed.data.content.knowledgeArticleId,
        },
        user,
      );

      recordAudit({
        action: 'ai.suggestion_applied',
        entity: 'ai_interaction',
        entityId: interactionId,
        actorId: user.id,
        metadata: {
          reviewId: review.id,
          ticketId: parsed.data.ticketId,
          target: 'resolution',
          ticketVersion: ticket.version,
        },
      });

      ok(res, { applied: true, target: 'resolution', ticketId: ticket.id, ticketVersion: ticket.version }, 201);
    }
  } catch (cause) {
    next(cause);
  }
});