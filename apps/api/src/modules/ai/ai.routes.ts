import { Router } from 'express';
import { ok, parseId } from '../../shared/http';
import { PERMISSIONS, requirePermission } from '../../shared/authorization';
import { authenticate, currentUser } from '../../shared/security/guards';
import { recordAudit } from '../audit';
import { Errors } from '../../shared/errors';
import { askSchema } from './ai.schemas';
import { askWithAuthorizedSources } from './ai.service';
import { getInteractionForUser, recordInteraction } from './interactions/interactions';
import { aiSourcesRouter } from './sources/sources.routes';

export const aiRouter = Router();
const REQUIREMENTS = ['FR-013', 'FR-014', 'FR-015', 'FR-021', 'NFR-003'];

// AIR-002: fuentes autorizadas (la recuperación filtrada que usará el flujo RAG de FR-013).
aiRouter.use(aiSourcesRouter);

/**
 * AIR-001 — el asistente responde.
 *
 * Flujo:
 *   1. authenticate + requirePermission(AI_QUERY): el permiso se exige ANTES de
 *      recuperar o enviar nada al modelo (AIR-008).
 *   2. zod `.strict()`: el cliente NO puede enviar roles, alcances ni listas de
 *      fuentes (decisión 1, AIR-008).
 *   3. askWithAuthorizedSources: recupera fuentes aprobadas, enmarca el contenido
 *      como dato, llama al proveedor y revalida los permisos post-generación.
 *   4. recordInteraction: la interacción queda asociada al usuario (el dueño
 *      puede reabrirla; al reabrirla se revalida cada referencia).
 *   5. recordAudit(ai.suggestion_generated): traza sin texto generado ni claves
 *      (AIR-007: traza de quién, cuándo, ticketId opcional, status y nº de fuentes).
 *
 * El endpoint responde 201 (la interacción se creó) con la interacción en `data`.
 * Si el proveedor falla, se audita ai.request_failed y se responde 502 sin
 * exponer detalles del proveedor (AIR-009).
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
      // El servicio lanza 403/404 por permisos o acceso al ticket: se propagan tal cual,
      // pero registramos el fallo del proveedor externo si fue un AppError 502.
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

    // La interacción se registra SIEMPRE: tanto si la IA respondió como si
    // devolvió "información insuficiente" (AIR-009: el usuario tiene el historial
    // de sus consultas; las fuentes se revalidan al reabrir).
    const interaction = recordInteraction({
      userId: user.id,
      question,
      answer: answer.status === 'answered' ? answer.answer : answer.message,
      references: answer.references,
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
