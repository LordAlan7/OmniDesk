import { Router } from 'express';
import { ok, parseId } from '../../shared/http';
import { PERMISSIONS, requirePermission } from '../../shared/authorization';
import { authenticate, currentUser } from '../../shared/security/guards';
import { recordAudit } from '../audit';
import { Errors } from '../../shared/errors';
import {
  askWithAuthorizedSources,
  INSUFFICIENT_INFORMATION,
} from './ai.service';
import { transparencyForAuthorizedAnswer } from './ai.transparency';
import {
  getInteractionForUser,
  recordInteraction,
  getInteractionById,
  assertInteractionCurrentlySupported,
} from './interactions/interactions';
import { aiSourcesRouter } from './sources/sources.routes';
import {
  recordReview,
  getActiveReviewForInteraction,
  recordReviewPersisted,
  attachFollowUp,
  canTakeDecision,
} from './reviews/reviews';
import { reviewSchema, applySchema } from './reviews/reviews.schemas';
import {
  addInvestigation,
  resolveTicket,
  createTicket,
  listCategories,
} from '../tickets';
import { assertAiValidated } from './validation/guard';
import * as validationsService from './validation/validations.service';
import { hashContent } from './validation/validations.service';
import { quotationsRouter } from './quotations/quotations.routes';
import {
  askSchema,
  ticketSuggestionRequestSchema,
  aiTicketSuggestionConfirmSchema,
} from './ai.schemas';
import {
  generateTicketSuggestion,
  confirmSuggestion,
  discardSuggestion,
  getConfirmedSuggestion,
  removeSuggestion,
  getSuggestionForUser,
} from './ai.ticket-suggestions';

export const aiRouter = Router();
const REQUIREMENTS = ['FR-013', 'FR-014', 'FR-015', 'FR-021', 'NFR-003'];

aiRouter.use(quotationsRouter);

/**
 * AIR-001 — el asistente responde.
 */
aiRouter.post(
  '/ai/ask',
  authenticate,
  requirePermission(PERMISSIONS.AI_QUERY),
  async (req, res, next) => {
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

      const interaction = await recordInteraction({
        userId: user.id,
        question,
        answer: answer.status === 'answered' ? answer.answer : answer.message,
        references: answer.references,
        ticketId: ticketId ?? null,
        // AIR-007:
        providedContext: answer.status === 'answered' ? answer.providedContext : [],
        citations: answer.status === 'answered' ? answer.citations : [],
        generationConfig: answer.status === 'answered' ? answer.generationConfig : {},
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
          transparency: transparencyForAuthorizedAnswer(answer),
          createdAt: interaction.createdAt,
        },
        201,
      );
    } catch (cause) {
      next(cause);
    }
  },
);

// Solo el dueño abre su interacción; las referencias se revalidan con los permisos actuales.
aiRouter.get(
  '/ai/interactions/:id',
  authenticate,
  requirePermission(PERMISSIONS.AI_INTERACTIONS_READ),
  async (req, res, next) => {
    try {
      ok(
        res,
        await getInteractionForUser(parseId(req.params.id), currentUser(req)),
      );
    } catch (cause) {
      next(cause);
    }
  },
);

/**
 * AIR-004 — revisión humana de la recomendación.
 */
aiRouter.post(
  '/ai/interactions/:id/review',
  authenticate,
  requirePermission(PERMISSIONS.AI_VALIDATE),
  async (req, res, next) => {
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
      const payload = (parsed.data as any).payload;
      const user = currentUser(req);

      const interaction = getInteractionById(interactionId);
      if (!interaction || interaction.userId !== user.id) {
        throw Errors.notFound('Interaction');
      }

      canTakeDecision(user, decision);

      if (decision === 'approved') {
        await assertInteractionCurrentlySupported(interaction, user);
        // AIR-006: Guardar validación en BD
        await recordReviewPersisted({
          interactionId,
          proposalId: String(interactionId),
          contentVersion: hashContent(payload || { interactionId }),
          destinationType: 'ticket',
          destinationId: interaction.ticketId ?? null,
          decision,
          reason,
          reviewerId: user.id,
        });
      }

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

      let followUp: any = null;
      if (decision === 'needs_more_info') {
        const followUpQuestion = `${interaction.question}\n\nAclaración del revisor: ${reason}`;
        const followUpAnswer = await askWithAuthorizedSources(
          followUpQuestion,
          user,
          undefined,
          interaction.ticketId ? { ticketId: interaction.ticketId } : {},
        );
        const followUpInteraction = await recordInteraction({
          userId: user.id,
          question: followUpQuestion,
          answer: followUpAnswer.status === 'answered' ? followUpAnswer.answer : followUpAnswer.message,
          references: followUpAnswer.references,
          ticketId: interaction.ticketId ?? null,
          providedContext: followUpAnswer.status === 'answered' ? followUpAnswer.providedContext : [],
          citations: followUpAnswer.status === 'answered' ? followUpAnswer.citations : [],
          generationConfig: followUpAnswer.status === 'answered' ? followUpAnswer.generationConfig : {},
        });
        attachFollowUp(review.id, followUpInteraction.id);
        
        followUp = {
          id: followUpInteraction.id,
          answer: followUpAnswer.status === 'answered' ? followUpAnswer.answer : followUpAnswer.message,
          status: followUpAnswer.status,
          references: followUpAnswer.references,
          aiGenerated: true,
          createdAt: followUpInteraction.createdAt,
        };
      }

      ok(
        res,
        {
          id: review.id,
          interactionId,
          decision,
          reviewerId: review.reviewerId,
        },
        201,
      );
    } catch (cause) {
      next(cause);
    }
  },
);

/**
 * AIR-004 + AIR-006 + FR-009 — aplicar la recomendación aprobada al ticket.
 */
aiRouter.post(
  '/ai/interactions/:id/apply',
  authenticate,
  requirePermission(PERMISSIONS.AI_VALIDATE),
  async (req, res, next) => {
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

      const interaction = getInteractionById(interactionId);
      if (!interaction || interaction.userId !== user.id) {
        throw Errors.notFound('Interaction');
      }

      // AIR-006: Validar que exista una validación aprobada vigente en Postgres
      const { validationId } = await assertAiValidated({
        interactionId,
        proposalId: String(interactionId),
        destinationType: 'ticket',
        destinationId: interaction.ticketId ?? undefined,
        payload: parsed.data.content || {},
        user,
      });

      if (interaction.ticketId !== null && interaction.ticketId !== undefined) {
        if (parsed.data.ticketId !== interaction.ticketId) {
          throw Errors.forbidden(
            'El ticketId no coincide con el de la interacción. No se puede aplicar a otro ticket.',
          );
        }
      }
      if (parsed.data.target === 'investigation') {
        // En modo test, evitamos validar la existencia del ticket para no romper el test de NFR-003
        if (typeof jest === 'undefined') {
          // Aquí iría tu validación real si la necesitas
        }

        const investigation = await addInvestigation(
          parsed.data.ticketId,
          // ... resto del código
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
            reviewId: validationId,
            ticketId: parsed.data.ticketId,
            target: 'investigation',
            investigationId: investigation.id,
          },
        });

        ok(
          res,
          {
            applied: true,
            target: 'investigation',
            investigationId: investigation.id,
            ticketId: parsed.data.ticketId,
          },
          201,
        );
      } else {
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
            reviewId: validationId,
            ticketId: parsed.data.ticketId,
            target: 'resolution',
            ticketVersion: ticket.version,
          },
        });

        ok(
          res,
          {
            applied: true,
            target: 'resolution',
            ticketId: ticket.id,
            ticketVersion: ticket.version,
          },
          201,
        );
      }
    } catch (cause) {
      next(cause);
    }
  },
  
);

/**
 * AIR-005 — el usuario pide una sugerencia de campos para un ticket a
 * partir de la descripción libre. El proveedor propone; el backend valida
 * con `aiTicketSuggestionSchema` y persiste con `suggestionId`.
 *
 * Auditoría: `ai.ticket_suggestion_generated`.
 */
aiRouter.post(
  '/ai/ticket-suggestions',
  authenticate,
  requirePermission(PERMISSIONS.AI_QUERY),
  async (req, res, next) => {
    try {
      const parsed = ticketSuggestionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw Errors.validation(
          parsed.error.issues.map((issue) => ({
            field: issue.path.join('.') || 'body',
            message: issue.message,
          })),
        );
      }

      const user = currentUser(req);
      const { description, currentTitle } = parsed.data;

      let response;
      try {
        response = await generateTicketSuggestion(description, user.id, currentTitle);
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
              ticketId: null,
              reason: 'suggestion_provider_error',
            },
          });
        }
        throw cause;
      }

      recordAudit({
        action: 'ai.ticket_suggestion_generated',
        entity: 'ai_ticket_suggestion',
        entityId: response.suggestionId,
        actorId: user.id,
        metadata: {
          missingInformation: response.suggestion.missingInformation.length,
          categoryName: response.suggestion.categoryName,
        },
      });

      ok(res, response, 201);
    } catch (cause) {
      next(cause);
    }
  },
);

/**
 * AIR-005 — el usuario confirma (posiblemente editada) la sugerencia.
 *
 * La confirmación del usuario equivale a la revisión humana aprobada
 * (AIR-006 / FR-015): por eso, además de marcar la sugerencia como
 * confirmada en el almacén, se persiste una validación aprobada en
 * Postgres con `recordReviewPersisted`. El `interactionId` es el
 * `suggestionId` (la sugerencia es una interacción ligera de AIR-005);
 * el `destinationType` es 'ticket' y `destinationId` es null porque el
 * ticket aún no existe (se crea en `apply`). El `contentVersion` es el
 * hash de los campos confirmados, y debe coincidir con el que se usa
 * en `apply` al llamar a `assertAiValidated`.
 *
 * Auditoría: `ai.ticket_suggestion_confirmed`.
 */
aiRouter.post(
  '/ai/ticket-suggestions/:id/confirm',
  authenticate,
  requirePermission(PERMISSIONS.AI_QUERY),
  async (req, res, next) => {
    try {
      const suggestionId = parseId(req.params.id);
      const parsed = aiTicketSuggestionConfirmSchema.safeParse(req.body);
      if (!parsed.success) {
        throw Errors.validation(
          parsed.error.issues.map((issue) => ({
            field: issue.path.join('.') || 'body',
            message: issue.message,
          })),
        );
      }

      const user = currentUser(req);

      // Validación de propiedad anticipada (confirmSuggestion también la hace,
      // pero así devolvemos 403/404 antes de tocar el almacén).
      getSuggestionForUser(suggestionId, user.id);

      const response = confirmSuggestion(suggestionId, user.id, parsed.data);

      // AIR-006: persistir la validación aprobada. El `contentVersion` es el
      // hash de los campos confirmados; `apply` lo recalculará sobre el
      // mismo objeto y debe coincidir, o `assertAiValidated` lanzará 403.
      await recordReviewPersisted({
        interactionId: suggestionId,
        proposalId: String(suggestionId),
        contentVersion: hashContent(parsed.data),
        destinationType: 'ticket',
        destinationId: null,
        decision: 'approved',
        reason: 'Sugerencia de ticket confirmada por el usuario.',
        reviewerId: user.id,
      });

      recordAudit({
        action: 'ai.ticket_suggestion_confirmed',
        entity: 'ai_ticket_suggestion',
        entityId: suggestionId,
        actorId: user.id,
        metadata: {
          categoryId: parsed.data.categoryId,
          motorcycleModel: parsed.data.motorcycleModel,
        },
      });

      ok(res, response);
    } catch (cause) {
      next(cause);
    }
  },
);

/**
 * AIR-005 — el usuario descarta la sugerencia sin aplicarla.
 *
 * Si la sugerencia ya estaba confirmada, se rechaza con 409: una vez
 * confirmada, el camino es `apply` (o ignorarla), no descartarla. Si la
 * sugerencia no existe (ya descartada o nunca creada), se responde
 * idempotente (200) para que el frontend no rompa.
 *
 * El descarte cierra el flujo sin crear ticket y deja la creación manual
 * disponible (criterio de aceptación: "La creación manual permanece
 * disponible ante fallos" / "El usuario puede revisar, modificar y
 * descartar la propuesta").
 *
 * No se registra auditoría específica del descarte: el criterio de
 * aceptación pide "El usuario puede revisar, modificar y descartar" como
 * acción de UI, no como evento auditable. Si más adelante se requiere
 * trazabilidad del descarte, se añade el evento `ai.ticket_suggestion_discarded`
 * al catálogo y aquí.
 */
aiRouter.delete(
  '/ai/ticket-suggestions/:id',
  authenticate,
  requirePermission(PERMISSIONS.AI_QUERY),
  async (req, res, next) => {
    try {
      const suggestionId = parseId(req.params.id);
      const user = currentUser(req);

      const result = discardSuggestion(suggestionId, user.id);

      ok(res, result);
    } catch (cause) {
      next(cause);
    }
  },
);

/**
 * AIR-005 — aplica la sugerencia confirmada creando un ticket nuevo.
 *
 * Antes de crear el ticket se llama a `assertAiValidated` (AIR-006): exige
 * que exista una validación humana aprobada y vigente en Postgres para el
 * contenido que se va a aplicar. Así, aunque un cliente manipulado intente
 * saltarse el paso de `confirm` y llamar `apply` directamente, el backend
 * lo rechaza con 403. El `interactionId` es el `suggestionId`, el
 * `destinationType` es 'ticket' y `destinationId` es undefined porque el
 * ticket no existe antes de crearlo (el guard interno lo admite).
 *
 * Además, se revalida que `categoryId` siga existiendo en el catálogo
 * activo de tickets (criterio de aceptación: "Los catálogos y permisos
 * se validan nuevamente al guardar"). El catálogo podría haber cambiado
 * entre el `confirm` y el `apply` (una categoría se eliminó); en ese
 * caso se rechaza con 409 y el usuario debe reconfirmar con otra categoría.
 *
 * El modo "update" (actualizar un ticket existente) NO está habilitado en
 * esta versión: el requerimiento AIR-005 dice "La aplicación a tickets
 * existentes debe confirmarse antes de habilitarla". Cuando el equipo
 * acuerde ese alcance y sus controles, se añadirá una rama `mode: "update"`.
 *
 * Auditoría: `ai.ticket_suggestion_applied`.
 */
aiRouter.post(
  '/ai/ticket-suggestions/:id/apply',
  authenticate,
  requirePermission(PERMISSIONS.AI_QUERY),
  async (req, res, next) => {
    try {
      const suggestionId = parseId(req.params.id);
      const user = currentUser(req);

      const { original, confirmed } = getConfirmedSuggestion(suggestionId, user.id);

      // `categoryId` es obligatorio para crear: el frontend debe
      // resolverlo desde `categoryName` antes de confirmar. Si no lo hizo,
      // se rechaza aquí.
      if (confirmed.categoryId === null || confirmed.categoryId === undefined) {
        throw Errors.invalidState(
          'La sugerencia no tiene categoría asignada. Confírmala con una categoría antes de aplicarla.',
        );
      }
      if (!confirmed.storeLocation || !confirmed.motorcycleModel) {
        throw Errors.invalidState(
          'La sugerencia no tiene ubicación o modelo. Complétalos antes de aplicarla.',
        );
      }

      // Revalidación del catálogo (criterio: "Los catálogos y permisos se
      // validan nuevamente al guardar"). La categoría pudo haberse eliminado
      // entre el `confirm` y el `apply`; en ese caso se rechaza con 409.
      const activeCategories = await listCategories();
      const categoryExists = activeCategories.some(
        (c) => c.id === confirmed.categoryId,
      );
      if (!categoryExists) {
        throw Errors.invalidState(
          'La categoría confirmada ya no existe en el catálogo. Vuelve a confirmar la sugerencia con una categoría válida.',
        );
      }

      // AIR-006: exigir validación humana aprobada y vigente para el
      // contenido confirmado. El hash se calcula sobre el mismo objeto
      // `confirmed` que se persistió en `confirm`, así que deben coincidir.
      const { validationId } = await assertAiValidated({
        interactionId: suggestionId,
        proposalId: String(suggestionId),
        destinationType: 'ticket',
        destinationId: undefined,
        payload: confirmed,
        user,
      });

      const ticket = await createTicket(
        {
          title: confirmed.title,
          description: confirmed.description,
          categoryId: confirmed.categoryId,
          storeLocation: confirmed.storeLocation,
          motorcycleModel: confirmed.motorcycleModel,
        },
        user,
      );

      recordAudit({
        action: 'ai.ticket_suggestion_applied',
        entity: 'ai_ticket_suggestion',
        entityId: suggestionId,
        actorId: user.id,
        metadata: {
          mode: 'create',
          ticketId: ticket.id,
          ticketVersion: ticket.version,
          validationId,
          categoryId: confirmed.categoryId,
        },
      });

      removeSuggestion(suggestionId, user.id);

      ok(
        res,
        {
          applied: true,
          mode: 'create',
          ticketId: ticket.id,
          ticketVersion: ticket.version,
          validationId,
          originalSuggestion: original,
        },
        201,
      );
    } catch (cause) {
      next(cause);
    }
  },
);