import { Router } from 'express';
import { z } from 'zod';
import { ok, parseId } from '../../../shared/http';
import { authenticate, currentUser } from '../../../shared/security/guards';
import { retrieveAuthorizedContext } from './retrieval';
import {
  getAuthorization,
  listAuthorizations,
  requestAuthorization,
  retryIngestion,
  review,
  revoke,
} from './sources.service';

export const aiSourcesRouter = Router();

const requestSchema = z
  .object({
    sourceType: z.enum(['article', 'document']),
    sourceId: z.number().int().positive(),
  })
  .strict();

const listSchema = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected', 'revoked', 'invalidated']).optional(),
    sourceType: z.enum(['article', 'document']).optional(),
    sourceId: z.coerce.number().int().positive().optional(),
  })
  .strict();

const approveSchema = z.object({ note: z.string().trim().min(1).max(500).optional() }).strict();
const rejectSchema = z.object({ note: z.string().trim().min(1, 'El motivo es obligatorio.').max(500) }).strict();
const revokeSchema = z.object({ reason: z.string().trim().min(1, 'El motivo es obligatorio.').max(500) }).strict();
const searchSchema = z.object({ query: z.string().trim().min(3).max(500) }).strict();

aiSourcesRouter.get('/ai/sources', authenticate, async (req, res, next) => {
  try {
    ok(res, await listAuthorizations(listSchema.parse(req.query), currentUser(req)));
  } catch (cause) {
    next(cause);
  }
});

/** Vista previa de la recuperación autorizada: solo lo que este usuario podría enviar como contexto. */
aiSourcesRouter.post('/ai/sources/search', authenticate, async (req, res, next) => {
  try {
    const { query } = searchSchema.parse(req.body);
    const { sufficient, fragments } = await retrieveAuthorizedContext(query, currentUser(req));
    ok(res, { sufficient, fragments });
  } catch (cause) {
    next(cause);
  }
});

aiSourcesRouter.post('/ai/sources', authenticate, async (req, res, next) => {
  try {
    const { sourceType, sourceId } = requestSchema.parse(req.body);
    ok(res, await requestAuthorization(sourceType, sourceId, currentUser(req)), 201);
  } catch (cause) {
    next(cause);
  }
});

aiSourcesRouter.get('/ai/sources/:id', authenticate, async (req, res, next) => {
  try {
    ok(res, await getAuthorization(parseId(req.params.id), currentUser(req)));
  } catch (cause) {
    next(cause);
  }
});

aiSourcesRouter.post('/ai/sources/:id/approve', authenticate, async (req, res, next) => {
  try {
    const { note } = approveSchema.parse(req.body ?? {});
    ok(res, await review(parseId(req.params.id), 'approve', note, currentUser(req)));
  } catch (cause) {
    next(cause);
  }
});

aiSourcesRouter.post('/ai/sources/:id/reject', authenticate, async (req, res, next) => {
  try {
    const { note } = rejectSchema.parse(req.body);
    ok(res, await review(parseId(req.params.id), 'reject', note, currentUser(req)));
  } catch (cause) {
    next(cause);
  }
});

aiSourcesRouter.post('/ai/sources/:id/revoke', authenticate, async (req, res, next) => {
  try {
    const { reason } = revokeSchema.parse(req.body);
    ok(res, await revoke(parseId(req.params.id), reason, currentUser(req)));
  } catch (cause) {
    next(cause);
  }
});

/** Reintento autorizado de una ingesta fallida. */
aiSourcesRouter.post(
  '/ai/sources/:id/retry-ingestion',
  authenticate,
  async (req, res, next) => {
    try {
      ok(
        res,
        await retryIngestion(
          parseId(req.params.id),
          currentUser(req),
        ),
      );
    } catch (cause) {
      next(cause);
    }
  },
);
