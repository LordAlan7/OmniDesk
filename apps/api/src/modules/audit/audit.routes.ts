import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../../shared/errors';
import { ok, paginationSchema, parseId } from '../../shared/http';
import { authenticate } from '../../shared/security/guards';
import { PERMISSIONS, requirePermission } from '../../shared/authorization';
import { AUDIT_EVENTS } from './audit.catalog';
import { getAudit, listAudit } from './audit.service';

export const auditRouter = Router();

const auditAccess = [authenticate, requirePermission(PERMISSIONS.AUDIT_READ)];

const isoDate = z.string().datetime({ offset: true });

const querySchema = paginationSchema
  .extend({
    entity: z.string().trim().min(1).max(60).optional(),
    entityId: z.coerce.number().int().positive().optional(),
    action: z.string().trim().min(1).max(80).optional(),
    actorId: z.coerce.number().int().positive().optional(),
    outcome: z.enum(['applied', 'rejected']).optional(),
    correlationId: z.string().trim().min(1).max(100).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: 'from must not be after to.',
    path: ['from'],
  });

// Solo lectura. Intencionalmente NO existen PATCH/PUT/DELETE (NFR-009): los errores se corrigen
// con nuevos eventos, nunca editando o borrando los existentes.
auditRouter.get('/audit-logs', ...auditAccess, async (req, res, next) => {
  try {
    const { page, limit, ...filters } = querySchema.parse(req.query);
    const { items, total } = await listAudit(filters, page, limit);
    res.json({ data: items, meta: { page, limit, total } });
  } catch (cause) {
    next(cause);
  }
});

/** Catálogo común de eventos (para poblar filtros y documentar la cobertura). */
auditRouter.get('/audit-logs/catalog', ...auditAccess, (_req, res) => {
  ok(
    res,
    Object.entries(AUDIT_EVENTS).map(([action, definition]) => ({
      action,
      entity: definition.entity,
      module: definition.module,
      description: definition.description,
      outcome: definition.outcome,
      implemented: definition.implemented,
    })),
  );
});

auditRouter.get('/audit-logs/:id', ...auditAccess, async (req, res, next) => {
  try {
    const record = await getAudit(parseId(req.params.id));
    if (!record) throw Errors.notFound('Audit record');
    ok(res, record);
  } catch (cause) {
    next(cause);
  }
});
