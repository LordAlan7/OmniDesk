import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../../shared/errors';
import { ok, paginated, paginationSchema, parseId } from '../../shared/http';
import { authenticate, currentUser } from '../../shared/security/guards';
import { listFor, markAllRead, markRead } from './notifications.service';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', authenticate, (req, res) => {
  const q = paginationSchema.extend({ unread: z.coerce.boolean().optional() }).parse(req.query);
  paginated(res, listFor(currentUser(req).id, q.unread), q.page, q.limit);
});

// "read-all" se declara antes que "/:id/read" por claridad
notificationsRouter.patch('/notifications/read-all', authenticate, (req, res) => {
  ok(res, { updated: markAllRead(currentUser(req).id) });
});

notificationsRouter.patch('/notifications/:id/read', authenticate, (req, res) => {
  const n = markRead(currentUser(req).id, parseId(req.params.id));
  if (!n) throw Errors.notFound('Notification');
  ok(res, n);
});
