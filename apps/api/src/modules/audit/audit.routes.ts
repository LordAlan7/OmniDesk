import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../../shared/errors';
import { ok, paginated, paginationSchema, parseId } from '../../shared/http';
import { authenticate, requireRole } from '../../shared/security/guards';
import { getAudit, listAudit } from './audit.service';

export const auditRouter = Router();

// Solo lectura. Intencionalmente NO existen PATCH/DELETE (NFR-009).
auditRouter.get('/audit-logs', authenticate, requireRole('Administrator', 'Manager'), (req, res) => {
  const query = paginationSchema
    .extend({
      entity: z.string().optional(),
      action: z.string().optional(),
      actorId: z.coerce.number().int().optional(),
    })
    .parse(req.query);
  paginated(res, listAudit(query), query.page, query.limit);
});

auditRouter.get('/audit-logs/:id', authenticate, requireRole('Administrator', 'Manager'), (req, res) => {
  const record = getAudit(parseId(req.params.id));
  if (!record) throw Errors.notFound('Audit record');
  ok(res, record);
});
