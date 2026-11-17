
import { Router } from 'express';
import { z } from 'zod';

import { ok, parseId } from '../../shared/http';

import {
  PERMISSIONS,
  requirePermission,
} from '../../shared/authorization';

import {
  authenticate,
  currentUser,
} from '../../shared/security/guards';

import { recordAudit } from '../audit';
import { Errors } from '../../shared/errors';

import {
  askSchema,
  ticketSuggestionRequestSchema,
} from './ai.schemas';

import { askWithAuthorizedSources } from './ai.service';
import { generateTicketSuggestion } from './ai.ticket-suggestions';
import { transparencyForAuthorizedAnswer } from './ai.transparency';

import {
  getInteractionForUser,
  assertInteractionCurrentlySupported,
} from './interactions/interactions';

import { interactionsService } from './interactions/interactions.service';
import { aiSourcesRouter } from './sources/sources.routes';

import {
  canTakeDecision,
  recordReviewPersisted,
} from './reviews/reviews';

import {
  reviewSchema,
  applySchema,
  applyInvestigationSchema,
  applyResolutionSchema,
} from './reviews/reviews.schemas';

import { reviewsService } from './reviews/reviews.service';
import { assertAiValidated } from './validation/guard';
import { hashContent } from './validation/validations.service';

import {
  addInvestigation,
  resolveTicket,
} from '../tickets';

export const aiRouter = Router();

// AIR-002: Fuentes autorizadas.
aiRouter.use(aiSourcesRouter);

// AIR-006: aprobación asociada al contenido exacto.
const reviewInvestigationSchema = reviewSchema.extend({
  target: z.literal('investigation'),
  content: applyInvestigationSchema.shape.content,
});

const reviewResolutionSchema = reviewSchema.extend({
  target: z.literal('resolution'),
  content: applyResolutionSchema.shape.content,
});

const reviewRequestSchema = z.union([
  reviewInvestigationSchema,
  reviewResolutionSchema,
  reviewSchema,
]);

function validationIssues(
  issues: z.ZodIssue[],
): { field: string; message: string }[] {
  return issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
  }));
}

// FR-013 + FR-015 + AIR-007
// Generación de respuestas y registro persistente.
aiRouter.post(
  '/ai/ask',
  authenticate,
  requirePermission(PERMISSIONS.AI_QUERY),
  async (req, res, next) => {
    try {
      const parsed = askSchema.safeParse(req.body);

      if (!parsed.success) {
        throw Errors.validation(
          validationIssues(parsed.error.issues),
        );
      }

      const { question, ticketId } = parsed.data;
      const user = currentUser(req);

      let answer: Awaited<
        ReturnType<typeof askWithAuthorizedSources>
      >;

      try {
        answer = await askWithAuthorizedSources(
          question,
          user,
          undefined,
          ticketId !== undefined ? { ticketId } : {},
        );
      } catch (cause) {
        if (
          cause instanceof Error &&
          'status' in cause &&
          (cause as { status: number }).status === 502
        ) {
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

      // FR-015: obtener ID de la interacción persistida.
      const interaction = await interactionsService.create({
        userId: user.id,
        question,
        answer:
          answer.status === 'answered'
            ? answer.answer
            : answer.message,
        references: answer.references,
        ticketId: ticketId ?? null,

        // AIR-007: trazabilidad.
        providedContext:
          answer.status === 'answered'
            ? answer.providedContext
            : [],

        citations:
          answer.status === 'answered'
            ? answer.citations
            : [],

        generationConfig:
          answer.status === 'answered'
            ? answer.generationConfig
            : {},
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
          answer:
            answer.status === 'answered'
              ? answer.answer
              : answer.message,
          references: answer.references,
          aiGenerated: true,
          transparency: transparencyForAuthorizedAnswer(
            answer,
          ),
          createdAt: interaction.createdAt,
        },
        201,
      );
    } catch (cause) {
      next(cause);
    }
  },
);

// FR-015 + AIR-008
// Consulta privada y revalidación de referencias.
aiRouter.get(
  '/ai/interactions/:id',
  authenticate,
  requirePermission(PERMISSIONS.AI_INTERACTIONS_READ),
  async (req, res, next) => {
    try {
      const interactionId = parseId(req.params.id);
      const user = currentUser(req);

      const result = await getInteractionForUser(
        interactionId,
        user,
        interactionsService.findById,
      );

      ok(res, result);
    } catch (cause) {
      next(cause);
    }
  },
);

// AIR-004 + AIR-006 + FR-015
// Registro de revisiones humanas.
aiRouter.post(
  '/ai/interactions/:id/review',
  authenticate,
  requirePermission(PERMISSIONS.AI_VALIDATE),
  async (req, res, next) => {
    try {
      const interactionId = parseId(req.params.id);
      const parsed = reviewRequestSchema.safeParse(
        req.body,
      );

      if (!parsed.success) {
        throw Errors.validation(
          validationIssues(parsed.error.issues),
        );
      }

      const { decision, reason } = parsed.data;
      const user = currentUser(req);

      const interaction =
        await interactionsService.findById(
          interactionId,
        );

      if (
        !interaction ||
        interaction.userId !== user.id
      ) {
        throw Errors.notFound('Interaction');
      }

      canTakeDecision(user, decision);

      if (decision === 'approved') {
        await assertInteractionCurrentlySupported(
          interaction,
          user,
        );

        if (
          !('target' in parsed.data) ||
          !('content' in parsed.data)
        ) {
          throw Errors.validation([
            {
              field: 'content',
              message:
                'Para aprobar se requiere target y el contenido exacto que se aplicará.',
            },
          ]);
        }

        if (
          interaction.ticketId === null ||
          interaction.ticketId === undefined
        ) {
          throw Errors.invalidState(
            'La interacción no está asociada a un ticket.',
          );
        }

        // AIR-006: aprobación ligada al contenido exacto.
        await recordReviewPersisted({
          interactionId,
          proposalId: String(interactionId),
          contentVersion: hashContent(
            parsed.data.content,
          ),
          destinationType: 'ticket',
          destinationId: interaction.ticketId,
          decision,
          reason,
          reviewerId: user.id,
        });
      }

      // FR-015: historial de revisiones.
      const previous =
        await reviewsService.findActive(
          interactionId,
        );

      const review = await reviewsService.create({
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
          supersedesId:
            review.supersedesId ?? null,
        },
      });

      if (decision === 'approved') {
        recordAudit({
          action: 'ai.suggestion_approved',
          entity: 'ai_validation',
          entityId: review.id,
          actorId: user.id,
          metadata: {
            interactionId,
            ticketId:
              interaction.ticketId ?? null,
          },
        });
      } else if (decision === 'rejected') {
        recordAudit({
          action: 'ai.suggestion_rejected',
          entity: 'ai_validation',
          entityId: review.id,
          actorId: user.id,
          metadata: {
            interactionId,
            ticketId:
              interaction.ticketId ?? null,
          },
        });
      }

      // AIR-004: seguimiento al solicitar más información.
      let followUp:
        Record<string, unknown> | null = null;

      if (decision === 'needs_more_info') {
        const followUpQuestion =
          `${interaction.question}\n\n` +
          `Aclaración del revisor: ${reason}`;

        const followUpAnswer =
          await askWithAuthorizedSources(
            followUpQuestion,
            user,
            undefined,
            interaction.ticketId !== null &&
            interaction.ticketId !== undefined
              ? {
                  ticketId: interaction.ticketId,
                }
              : {},
          );

        const followUpInteraction =
          await interactionsService.create({
            userId: user.id,
            question: followUpQuestion,
            answer:
              followUpAnswer.status === 'answered'
                ? followUpAnswer.answer
                : followUpAnswer.message,
            references: followUpAnswer.references,
            ticketId:
              interaction.ticketId ?? null,

            providedContext:
              followUpAnswer.status === 'answered'
                ? followUpAnswer.providedContext
                : [],

            citations:
              followUpAnswer.status === 'answered'
                ? followUpAnswer.citations
                : [],

            generationConfig:
              followUpAnswer.status === 'answered'
                ? followUpAnswer.generationConfig
                : {},
          });

        await reviewsService.attachFollowUp(
          review.id,
          followUpInteraction.id,
        );

        recordAudit({
          action: 'ai.suggestion_generated',
          entity: 'ai_interaction',
          entityId: followUpInteraction.id,
          actorId: user.id,
          metadata: {
            ticketId:
              interaction.ticketId ?? null,
            status: followUpAnswer.status,
            references:
              followUpAnswer.references.length,
            followUpOf: interactionId,
          },
        });

        followUp = {
          id: followUpInteraction.id,
          answer:
            followUpAnswer.status === 'answered'
              ? followUpAnswer.answer
              : followUpAnswer.message,
          status: followUpAnswer.status,
          references: followUpAnswer.references,
          aiGenerated: true,
          transparency:
            transparencyForAuthorizedAnswer(
              followUpAnswer,
            ),
          createdAt:
            followUpInteraction.createdAt,
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
          supersedesId:
            review.supersedesId ?? null,
          followUp,
        },
        201,
      );
    } catch (cause) {
      next(cause);
    }
  },
);

// AIR-004 + AIR-006 + FR-009 + FR-015
// Aplicación de recomendaciones aprobadas.
aiRouter.post(
  '/ai/interactions/:id/apply',
  authenticate,
  requirePermission(PERMISSIONS.AI_VALIDATE),
  async (req, res, next) => {
    try {
      const interactionId = parseId(
        req.params.id,
      );

      const parsed = applySchema.safeParse(
        req.body,
      );

      if (!parsed.success) {
        throw Errors.validation(
          validationIssues(parsed.error.issues),
        );
      }

      const user = currentUser(req);

      const interaction =
        await interactionsService.findById(
          interactionId,
        );

      if (
        !interaction ||
        interaction.userId !== user.id
      ) {
        throw Errors.notFound('Interaction');
      }

      await assertInteractionCurrentlySupported(
        interaction,
        user,
      );

      // AIR-004: última revisión aprobada.
      const review =
        await reviewsService.findActive(
          interactionId,
        );

      if (
        !review ||
        review.decision !== 'approved'
      ) {
        throw Errors.invalidState(
          'La recomendación no está aprobada. Debe revisarse y aprobarse antes de aplicarla.',
        );
      }

      // FR-015: verificar ticket asociado.
      if (
        interaction.ticketId === null ||
        interaction.ticketId === undefined
      ) {
        throw Errors.invalidState(
          'La interacción no está asociada a un ticket.',
        );
      }

      if (
        parsed.data.ticketId !==
        interaction.ticketId
      ) {
        throw Errors.forbidden(
          'El ticketId no coincide con el de la interacción.',
        );
      }

      // AIR-006: verificar la versión exacta del contenido.
      const {
        validationId,
        contentVersion,
      } = await assertAiValidated({
        interactionId,
        proposalId: String(interactionId),
        destinationType: 'ticket',
        destinationId:
          parsed.data.ticketId,
        payload: parsed.data.content,
        user,
      });

      // Contexto que viaja hasta la transacción PostgreSQL.
      const aiValidation = {
        validationId,
        interactionId,
        proposalId: String(interactionId),
        destinationId:
          parsed.data.ticketId,
        appliedBy: user.id,
        contentVersion,
      };

      if (
        parsed.data.target ===
        'investigation'
      ) {
        const investigation =
          await addInvestigation(
            parsed.data.ticketId,
            {
              activity:
                parsed.data.content.activity,
              result:
                parsed.data.content.result,
              knowledgeArticleId:
                parsed.data.content
                  .knowledgeArticleId,
            },
            user,
            aiValidation,
          );

        recordAudit({
          action: 'ai.suggestion_applied',
          entity: 'ai_interaction',
          entityId: interactionId,
          actorId: user.id,
          metadata: {
            reviewId: review.id,
            validationId,
            ticketId:
              parsed.data.ticketId,
            target: 'investigation',
            investigationId:
              investigation.id,
          },
        });

        ok(
          res,
          {
            applied: true,
            target: 'investigation',
            investigationId:
              investigation.id,
            ticketId:
              parsed.data.ticketId,
          },
          201,
        );
      } else {
        const ticket = await resolveTicket(
          parsed.data.ticketId,
          {
            resolution:
              parsed.data.content.resolution,
            resolutionVerification:
              parsed.data.content
                .resolutionVerification,
            rootCause:
              parsed.data.content.rootCause,
            observations:
              parsed.data.content.observations,
            knowledgeArticleId:
              parsed.data.content
                .knowledgeArticleId,
          },
          user,
          parsed.data.expectedVersion,
          aiValidation,
        );

        recordAudit({
          action: 'ai.suggestion_applied',
          entity: 'ai_interaction',
          entityId: interactionId,
          actorId: user.id,
          metadata: {
            reviewId: review.id,
            validationId,
            ticketId:
              parsed.data.ticketId,
            target: 'resolution',
            ticketVersion:
              ticket.version,
          },
        });

        ok(
          res,
          {
            applied: true,
            target: 'resolution',
            ticketId: ticket.id,
            ticketVersion:
              ticket.version,
          },
          201,
        );
      }
    } catch (cause) {
      next(cause);
    }
  },
);

// FR-014: sugerencias de tickets.
aiRouter.post(
  '/ai/ticket-suggestions',
  authenticate,
  requirePermission(PERMISSIONS.AI_QUERY),
  async (req, res, next) => {
    try {
      const parsed =
        ticketSuggestionRequestSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        throw Errors.validation(
          validationIssues(parsed.error.issues),
        );
      }

      const { description } = parsed.data;

      const suggestion =
        await generateTicketSuggestion(
          description,
        );

      ok(res, suggestion);
    } catch (cause) {
      next(cause);
    }
  },
);
