import { createSuggestionInteraction } from './interactions/interactions.service';
import { Router } from 'express';
import { z } from 'zod';
import { ok, parseId } from '../../shared/http';
import { PERMISSIONS, requirePermission, } from '../../shared/authorization';
import { authenticate, currentUser, } from '../../shared/security/guards';
import { recordAudit } from '../audit';
import { Errors } from '../../shared/errors';
import { askWithAuthorizedSources } from './ai.service';
import { transparencyForAuthorizedAnswer } from './ai.transparency';
import { getInteractionForUser, assertInteractionCurrentlySupported, } from './interactions/interactions';
import { interactionsService } from './interactions/interactions.service';
import { aiSourcesRouter } from './sources/sources.routes';
import { canTakeDecision, recordReviewPersisted, } from './reviews/reviews';
import { reviewSchema, applySchema, applyInvestigationSchema, applyResolutionSchema, } from './reviews/reviews.schemas';
import { reviewsService } from './reviews/reviews.service';
import { addInvestigation, resolveTicket, createTicket, listCategories, } from '../tickets';
import { assertAiValidated, assertAiTicketCreationValidated } from './validation/guard';
import { hashContent } from './validation/validations.service';
import { quotationsRouter } from './quotations/quotations.routes';
import { askSchema, ticketSuggestionRequestSchema, aiTicketSuggestionConfirmSchema, } from './ai.schemas';
import { generateTicketSuggestion, confirmSuggestion, discardSuggestion, getConfirmedSuggestion, removeSuggestion, getSuggestionForUser, } from './ai.ticket-suggestions';
export const aiRouter = Router();
// AIR-005 -> AIR-007: la sugerencia vive en memoria; la interacción y aprobación en PostgreSQL.
const suggestionInteractionIds = new Map<number, number>();
// Evita peticiones simultáneas sobre la misma sugerencia dentro de esta instancia.
const confirmingSuggestions = new Set<number>();
const applyingSuggestions = new Set<number>();
aiRouter.use(aiSourcesRouter);
aiRouter.use(quotationsRouter);
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
function validationIssues(issues: z.ZodIssue[]): {
    field: string;
    message: string;
}[] {
    return issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
    }));
}
// FR-013 + FR-015 + AIR-007
// Generación de respuestas y registro persistente.
aiRouter.post('/ai/ask', authenticate, requirePermission(PERMISSIONS.AI_QUERY), async (req, res, next) => {
    try {
        const parsed = askSchema.safeParse(req.body);
        if (!parsed.success) {
            throw Errors.validation(validationIssues(parsed.error.issues));
        }
        const { question, ticketId } = parsed.data;
        const user = currentUser(req);
        let answer: Awaited<ReturnType<typeof askWithAuthorizedSources>>;
        try {
            answer = await askWithAuthorizedSources(question, user, undefined, ticketId !== undefined ? { ticketId } : {});
        }
        catch (cause) {
            if (cause instanceof Error &&
                'status' in cause &&
                (cause as {
                    status: number;
                }).status === 502) {
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
            answer: answer.status === 'answered'
                ? answer.answer
                : answer.message,
            references: answer.references,
            ticketId: ticketId ?? null,
            // AIR-007: trazabilidad.
            providedContext: answer.status === 'answered'
                ? answer.providedContext
                : [],
            citations: answer.status === 'answered'
                ? answer.citations
                : [],
            generationConfig: answer.status === 'answered'
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
        ok(res, {
            id: interaction.id,
            status: answer.status,
            answer: answer.status === 'answered'
                ? answer.answer
                : answer.message,
            references: answer.references,
            aiGenerated: true,
            transparency: transparencyForAuthorizedAnswer(answer),
            createdAt: interaction.createdAt,
        }, 201);
    }
    catch (cause) {
        next(cause);
    }
});
// FR-015 + AIR-008
// Consulta privada y revalidación de referencias.
aiRouter.get('/ai/interactions/:id', authenticate, requirePermission(PERMISSIONS.AI_INTERACTIONS_READ), async (req, res, next) => {
    try {
        const interactionId = parseId(req.params.id);
        const user = currentUser(req);
        const result = await getInteractionForUser(interactionId, user, interactionsService.findById);
        ok(res, result);
    }
    catch (cause) {
        next(cause);
    }
});
// AIR-004 + AIR-006 + FR-015
// Registro de revisiones humanas.
aiRouter.post('/ai/interactions/:id/review', authenticate, requirePermission(PERMISSIONS.AI_VALIDATE), async (req, res, next) => {
    try {
        const interactionId = parseId(req.params.id);
        const parsed = reviewRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            throw Errors.validation(validationIssues(parsed.error.issues));
        }
        const { decision, reason } = parsed.data;
        const user = currentUser(req);
        const interaction = await interactionsService.findById(interactionId);
        if (!interaction ||
            interaction.userId !== user.id) {
            throw Errors.notFound('Interaction');
        }
        canTakeDecision(user, decision);
        if (decision === 'approved') {
            await assertInteractionCurrentlySupported(interaction, user);
            if (!('target' in parsed.data) ||
                !('content' in parsed.data)) {
                throw Errors.validation([
                    {
                        field: 'content',
                        message: 'Para aprobar se requiere target y el contenido exacto que se aplicará.',
                    },
                ]);
            }
            if (interaction.ticketId === null ||
                interaction.ticketId === undefined) {
                throw Errors.invalidState('La interacción no está asociada a un ticket.');
            }
            // AIR-006: aprobación ligada al contenido exacto.
            await recordReviewPersisted({
                interactionId,
                proposalId: String(interactionId),
                contentVersion: hashContent(parsed.data.content),
                destinationType: 'ticket',
                destinationId: interaction.ticketId,
                decision,
                reason,
                reviewerId: user.id,
            });
        }
        // FR-015: historial de revisiones.
        const previous = await reviewsService.findActive(interactionId);
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
                supersedesId: review.supersedesId ?? null,
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
                    ticketId: interaction.ticketId ?? null,
                },
            });
        }
        else if (decision === 'rejected') {
            recordAudit({
                action: 'ai.suggestion_rejected',
                entity: 'ai_validation',
                entityId: review.id,
                actorId: user.id,
                metadata: {
                    interactionId,
                    ticketId: interaction.ticketId ?? null,
                },
            });
        }
        // AIR-004: seguimiento al solicitar más información.
        let followUp: Record<string, unknown> | null = null;
        if (decision === 'needs_more_info') {
            const followUpQuestion = `${interaction.question}\n\n` +
                `Aclaración del revisor: ${reason}`;
            const followUpAnswer = await askWithAuthorizedSources(followUpQuestion, user, undefined, interaction.ticketId !== null &&
                interaction.ticketId !== undefined
                ? {
                    ticketId: interaction.ticketId,
                }
                : {});
            const followUpInteraction = await interactionsService.create({
                userId: user.id,
                question: followUpQuestion,
                answer: followUpAnswer.status === 'answered'
                    ? followUpAnswer.answer
                    : followUpAnswer.message,
                references: followUpAnswer.references,
                ticketId: interaction.ticketId ?? null,
                providedContext: followUpAnswer.status === 'answered'
                    ? followUpAnswer.providedContext
                    : [],
                citations: followUpAnswer.status === 'answered'
                    ? followUpAnswer.citations
                    : [],
                generationConfig: followUpAnswer.status === 'answered'
                    ? followUpAnswer.generationConfig
                    : {},
            });
            await reviewsService.attachFollowUp(review.id, followUpInteraction.id);
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
                answer: followUpAnswer.status === 'answered'
                    ? followUpAnswer.answer
                    : followUpAnswer.message,
                status: followUpAnswer.status,
                references: followUpAnswer.references,
                aiGenerated: true,
                transparency: transparencyForAuthorizedAnswer(followUpAnswer),
                createdAt: followUpInteraction.createdAt,
            };
        }
        ok(res, {
            id: review.id,
            interactionId,
            decision,
            reviewerId: review.reviewerId,
            reviewedAt: review.reviewedAt,
            supersedesId: review.supersedesId ?? null,
            followUp,
        }, 201);
    }
    catch (cause) {
        next(cause);
    }
});
// AIR-004 + AIR-006 + FR-009 + FR-015
// Aplicación de recomendaciones aprobadas.
aiRouter.post('/ai/interactions/:id/apply', authenticate, requirePermission(PERMISSIONS.AI_VALIDATE), async (req, res, next) => {
    try {
        const interactionId = parseId(req.params.id);
        const parsed = applySchema.safeParse(req.body);
        if (!parsed.success) {
            throw Errors.validation(validationIssues(parsed.error.issues));
        }
        const user = currentUser(req);
        const interaction = await interactionsService.findById(interactionId);
        if (!interaction ||
            interaction.userId !== user.id) {
            throw Errors.notFound('Interaction');
        }
        await assertInteractionCurrentlySupported(interaction, user);
        // AIR-004: última revisión aprobada.
        const review = await reviewsService.findActive(interactionId);
        if (!review ||
            review.decision !== 'approved') {
            throw Errors.invalidState('La recomendación no está aprobada. Debe revisarse y aprobarse antes de aplicarla.');
        }
        // FR-015: verificar ticket asociado.
        if (interaction.ticketId === null ||
            interaction.ticketId === undefined) {
            throw Errors.invalidState('La interacción no está asociada a un ticket.');
        }
        if (parsed.data.ticketId !==
            interaction.ticketId) {
            throw Errors.forbidden('El ticketId no coincide con el de la interacción.');
        }
        // AIR-006: verificar la versión exacta del contenido.
        const { validationId, contentVersion, } = await assertAiValidated({
            interactionId,
            proposalId: String(interactionId),
            destinationType: 'ticket',
            destinationId: parsed.data.ticketId,
            payload: parsed.data.content,
            user,
        });
        // Contexto que viaja hasta la transacción PostgreSQL.
        const aiValidation = {
            validationId,
            interactionId,
            proposalId: String(interactionId),
            destinationId: parsed.data.ticketId,
            appliedBy: user.id,
            contentVersion,
        };
        if (parsed.data.target ===
            'investigation') {
            const investigation = await addInvestigation(parsed.data.ticketId, {
                activity: parsed.data.content.activity,
                result: parsed.data.content.result,
                knowledgeArticleId: parsed.data.content
                    .knowledgeArticleId,
            }, user, aiValidation);
            recordAudit({
                action: 'ai.suggestion_applied',
                entity: 'ai_interaction',
                entityId: interactionId,
                actorId: user.id,
                metadata: {
                    reviewId: review.id,
                    validationId,
                    ticketId: parsed.data.ticketId,
                    target: 'investigation',
                    investigationId: investigation.id,
                },
            });
            ok(res, {
                applied: true,
                target: 'investigation',
                investigationId: investigation.id,
                ticketId: parsed.data.ticketId,
            }, 201);
        }
        else {
            const ticket = await resolveTicket(parsed.data.ticketId, {
                resolution: parsed.data.content.resolution,
                resolutionVerification: parsed.data.content
                    .resolutionVerification,
                rootCause: parsed.data.content.rootCause,
                observations: parsed.data.content.observations,
                knowledgeArticleId: parsed.data.content
                    .knowledgeArticleId,
            }, user, parsed.data.expectedVersion, aiValidation);
            recordAudit({
                action: 'ai.suggestion_applied',
                entity: 'ai_interaction',
                entityId: interactionId,
                actorId: user.id,
                metadata: {
                    reviewId: review.id,
                    validationId,
                    ticketId: parsed.data.ticketId,
                    target: 'resolution',
                    ticketVersion: ticket.version,
                },
            });
            ok(res, {
                applied: true,
                target: 'resolution',
                ticketId: ticket.id,
                ticketVersion: ticket.version,
            }, 201);
        }
    }
    catch (cause) {
        next(cause);
    }
});
/**
 * AIR-005 — el usuario pide una sugerencia de campos para un ticket a
 * partir de la descripción libre. El proveedor propone; el backend valida
 * con `aiTicketSuggestionSchema` y persiste con `suggestionId`.
 *
 * Auditoría: `ai.ticket_suggestion_generated`.

 */
aiRouter.post('/ai/ticket-suggestions', authenticate, requirePermission(PERMISSIONS.AI_QUERY), async (req, res, next) => {
    try {
        const parsed = ticketSuggestionRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            throw Errors.validation(validationIssues(parsed.error.issues));
        }
        const user = currentUser(req);
        const { description, currentTitle } = parsed.data;
        let response;
        try {
            response = await generateTicketSuggestion(description, user.id, currentTitle);
        }
        catch (cause) {
            if (cause instanceof Error &&
                'status' in cause &&
                (cause as {
                    status: number;
                }).status === 502) {
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
        // AIR-007: registrar una interacción real y utilizar su ID en AIR-006.
        // No se emplea el ID del almacén de sugerencias como FK.
        let interaction;
        try {
            interaction = await createSuggestionInteraction({
                userId: user.id,
                ticketId: null,
                question: description,
                answer: JSON.stringify(response.suggestion),
                references: [],
                providedContext: [],
                citations: [],
                generationConfig: {
                    feature: 'AIR-005',
                    suggestionId: response.suggestionId,
                },
            });
        }
        catch (cause) {
            // Si falla PostgreSQL, no dejar una sugerencia aparentemente utilizable.
            removeSuggestion(response.suggestionId, user.id);
            throw cause;
        }
        suggestionInteractionIds.set(response.suggestionId, interaction.id);
        recordAudit({
            action: 'ai.ticket_suggestion_generated',
            entity: 'ai_ticket_suggestion',
            entityId: response.suggestionId,
            actorId: user.id,
            metadata: {
                interactionId: interaction.id,
                missingInformation: response.suggestion.missingInformation.length,
                categoryName: response.suggestion.categoryName,
            },
        });
        ok(res, response, 201);
    }
    catch (cause) {
        next(cause);
    }
});
/**
 * AIR-005 — el usuario confirma (posiblemente editada) la sugerencia.
 *
 * La confirmación del usuario equivale a la revisión humana aprobada
 * (AIR-006 / FR-015): por eso, además de marcar la sugerencia como
 * confirmada en el almacén, se persiste una validación aprobada en
 * Postgres con `recordReviewPersisted`. El `interactionId` es el
 * ID persistido de AIR-007, diferente del `suggestionId`;
 * el `destinationType` es 'ticket' y `destinationId` es null porque el
 * ticket aún no existe (se crea en `apply`). El `contentVersion` es el
 * hash de los campos confirmados, y debe coincidir con el que se usa
 * en `apply` al llamar a `assertAiValidated`.
 *
 * Auditoría: `ai.ticket_suggestion_confirmed`.

 */
aiRouter.post('/ai/ticket-suggestions/:id/confirm', authenticate, requirePermission(PERMISSIONS.AI_QUERY), async (req, res, next) => {
    try {
        const suggestionId = parseId(req.params.id);
        const parsed = aiTicketSuggestionConfirmSchema.safeParse(req.body);
        if (!parsed.success) {
            throw Errors.validation(parsed.error.issues.map((issue) => ({
                field: issue.path.join('.') || 'body',
                message: issue.message,
            })));
        }
        const user = currentUser(req);
        // Validación de propiedad anticipada (confirmSuggestion también la hace,
        // pero así devolvemos 403/404 antes de tocar el almacén).
        const suggestion = getSuggestionForUser(suggestionId, user.id);
        if (suggestion.confirmedAt !== null || confirmingSuggestions.has(suggestionId)) {
            throw Errors.invalidState('Esta sugerencia ya fue confirmada o está en proceso de confirmación.');
        }
        const interactionId = suggestionInteractionIds.get(suggestionId);
        if (interactionId === undefined) {
            throw Errors.invalidState('La sugerencia no tiene una interacción de IA registrada.');
        }
        confirmingSuggestions.add(suggestionId);
        let response;
        try {
            // AIR-006: persistir la validación aprobada. El `contentVersion` es el
            // hash de los campos confirmados; `apply` lo recalculará sobre el
            // mismo objeto y debe coincidir, o `assertAiValidated` lanzará 403.
            await recordReviewPersisted({
                interactionId,
                proposalId: String(suggestionId),
                contentVersion: hashContent(parsed.data),
                destinationType: 'ticket',
                destinationId: null,
                decision: 'approved',
                reason: 'Sugerencia de ticket confirmada por el usuario.',
                reviewerId: user.id,
            });
            // Confirmar en memoria SOLAMENTE después de persistir la aprobación.
            response = confirmSuggestion(suggestionId, user.id, parsed.data);
        }
        finally {
            confirmingSuggestions.delete(suggestionId);
        }
        recordAudit({
            action: 'ai.ticket_suggestion_confirmed',
            entity: 'ai_ticket_suggestion',
            entityId: suggestionId,
            actorId: user.id,
            metadata: {
                interactionId,
                categoryId: parsed.data.categoryId,
                motorcycleModel: parsed.data.motorcycleModel,
            },
        });
        ok(res, response);
    }
    catch (cause) {
        next(cause);
    }
});
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
aiRouter.delete('/ai/ticket-suggestions/:id', authenticate, requirePermission(PERMISSIONS.AI_QUERY), async (req, res, next) => {
    try {
        const suggestionId = parseId(req.params.id);
        const user = currentUser(req);
        const result = discardSuggestion(suggestionId, user.id);
        suggestionInteractionIds.delete(suggestionId);
        ok(res, result);
    }
    catch (cause) {
        next(cause);
    }
});
/**
 * AIR-005 — aplica la sugerencia confirmada creando un ticket nuevo.
 *
 * Antes de crear el ticket se llama a `assertAiValidated` (AIR-006): exige
 * que exista una validación humana aprobada y vigente en Postgres para el
 * contenido que se va a aplicar. Así, aunque un cliente manipulado intente
 * saltarse el paso de `confirm` y llamar `apply` directamente, el backend
 * lo rechaza con 403. El `interactionId` es el ID real de AIR-007, distinto del `suggestionId`;
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
aiRouter.post('/ai/ticket-suggestions/:id/apply', authenticate, requirePermission(PERMISSIONS.AI_QUERY), async (req, res, next) => {
    try {
        const suggestionId = parseId(req.params.id);
        const user = currentUser(req);
        const { original, confirmed } = getConfirmedSuggestion(suggestionId, user.id);
        const interactionId = suggestionInteractionIds.get(suggestionId);
        if (interactionId === undefined) {
            throw Errors.invalidState('La sugerencia no tiene una interacción de IA registrada.');
        }
        if (applyingSuggestions.has(suggestionId)) {
            throw Errors.invalidState('Esta sugerencia ya se está aplicando.');
        }
        applyingSuggestions.add(suggestionId);
        try {
            // `categoryId` es obligatorio para crear: el frontend debe
            // resolverlo desde `categoryName` antes de confirmar. Si no lo hizo,
            // se rechaza aquí.
            if (confirmed.categoryId === null || confirmed.categoryId === undefined) {
                throw Errors.invalidState('La sugerencia no tiene categoría asignada. Confírmala con una categoría antes de aplicarla.');
            }
            if (!confirmed.storeLocation || !confirmed.motorcycleModel) {
                throw Errors.invalidState('La sugerencia no tiene ubicación o modelo. Complétalos antes de aplicarla.');
            }
            // Revalidación del catálogo (criterio: "Los catálogos y permisos se
            // validan nuevamente al guardar"). La categoría pudo haberse eliminado
            // entre el `confirm` y el `apply`; en ese caso se rechaza con 409.
            const activeCategories = await listCategories();
            const categoryExists = activeCategories.some((c) => c.id === confirmed.categoryId);
            if (!categoryExists) {
                throw Errors.invalidState('La categoría confirmada ya no existe en el catálogo. Vuelve a confirmar la sugerencia con una categoría válida.');
            }
            // AIR-006: exigir validación humana aprobada y vigente para el
            // contenido confirmado. El hash se calcula sobre el mismo objeto
            // `confirmed` que se persistió en `confirm`, así que deben coincidir.
            const { validationId, contentVersion } = await assertAiTicketCreationValidated({
                interactionId,
                suggestionId,
                proposalId: String(suggestionId),
                payload: confirmed,
                user,
            });
            const ticket = await createTicket({
                title: confirmed.title,
                description: confirmed.description,
                categoryId: confirmed.categoryId,
                storeLocation: confirmed.storeLocation,
                motorcycleModel: confirmed.motorcycleModel,
            }, user,
              `ai-ticket-suggestion:${interactionId}`,
              {
                validationId,
                interactionId,
                proposalId: String(suggestionId),
                contentVersion,
                appliedBy: user.id,
              },
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
                    interactionId,
                    categoryId: confirmed.categoryId,
                },
            });
            removeSuggestion(suggestionId, user.id);
            suggestionInteractionIds.delete(suggestionId);
            ok(res, {
                applied: true,
                mode: 'create',
                ticketId: ticket.id,
                ticketVersion: ticket.version,
                validationId,
                originalSuggestion: original,
            }, 201);
        }
        finally {
            applyingSuggestions.delete(suggestionId);
        }
    }
    catch (cause) {
        next(cause);
    }
});
