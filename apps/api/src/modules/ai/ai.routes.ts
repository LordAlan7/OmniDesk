import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { ok, parseId } from '../../shared/http';
import { PERMISSIONS, requirePermission } from '../../shared/authorization';
import { aiRateLimiter } from '../../shared/middleware/rateLimit';
import { authenticate, currentUser } from '../../shared/security/guards';
import { runAssistantQuery } from './assistant.service';
import { getInteractionForUser } from './interactions/interactions';
import { aiSourcesRouter } from './sources/sources.routes';

export const aiRouter = Router();

// AIR-002: fuentes autorizadas (la recuperación filtrada que usa el flujo RAG de FR-013).
aiRouter.use(aiSourcesRouter);

/**
 * FR-013: la consulta solo acepta pregunta y, opcionalmente, un ticket. Roles, permisos, fuentes o contenido
 * de tickets enviados por el cliente se RECHAZAN (`.strict()`): el servidor decide todo eso.
 * Una pregunta vacía o demasiado larga se rechaza aquí, antes de cualquier llamada al proveedor.
 */
const querySchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(1, 'La pregunta no puede estar vacía.')
      .max(env.aiMaxQuestionChars, `La pregunta no puede superar ${env.aiMaxQuestionChars} caracteres.`),
    ticketId: z.number().int().positive().optional(),
  })
  .strict();

const askHandler = [
  authenticate,
  requirePermission(PERMISSIONS.AI_QUERY),
  aiRateLimiter,
  async (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    try {
      const { question, ticketId } = querySchema.parse(req.body);
      ok(res, await runAssistantQuery(question, currentUser(req), ticketId === undefined ? {} : { ticketId }));
    } catch (cause) {
      next(cause);
    }
  },
];

aiRouter.post('/ai/queries', ...askHandler);
// Alias del endpoint original del diseño.
aiRouter.post('/ai/ask', ...askHandler);

// Solo el dueño abre su interacción; las referencias se revalidan con los permisos actuales.
aiRouter.get('/ai/interactions/:id', authenticate, requirePermission(PERMISSIONS.AI_INTERACTIONS_READ), async (req, res, next) => {
  try {
    ok(res, await getInteractionForUser(parseId(req.params.id), currentUser(req)));
  } catch (cause) {
    next(cause);
  }
});
