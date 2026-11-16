import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../../shared/errors';
import { ok, paginated, paginationSchema, parseId } from '../../shared/http';
import { authenticate, currentUser } from '../../shared/security/guards';
import {
  listForUser,
  unreadCountForUser,
  markRead,
  markAllRead,
} from './notifications.service';

export const notificationsRouter = Router();

const querySchema = paginationSchema.extend({
  unread: z.coerce.boolean().optional(),
}).strict();

// ──────────────────────────────────────────────────────────────────────────
// FR-020: rutas bajo /me/notifications (decisión 8)
// ──────────────────────────────────────────────────────────────────────────
// El userId se obtiene siempre de la sesión, nunca del query/body.
// Esto garantiza que un usuario no pueda consultar ni marcar notificaciones
// ajenas manipulando parámetros.

/** Lista las notificaciones del usuario autenticado (paginada). */
notificationsRouter.get('/me/notifications', authenticate, async (req, res, next) => {
  try {
    const { page, limit, unread } = querySchema.parse(req.query);
    const result = await listForUser(currentUser(req), {
      onlyUnread: unread,
      page,
      limit,
    });
    paginated(res, result.items, page, limit);
  } catch (cause) {
    next(cause);
  }
});

/** Cantidad de notificaciones no leídas (para el badge del frontend). */
notificationsRouter.get('/me/notifications/unread-count', authenticate, async (req, res, next) => {
  try {
    const count = await unreadCountForUser(currentUser(req));
    ok(res, { count });
  } catch (cause) {
    next(cause);
  }
});

/**
 * Marca todas las notificaciones del usuario como leídas.
 * Se declara ANTES que /:id/read para evitar conflicto de rutas.
 */
notificationsRouter.patch('/me/notifications/read-all', authenticate, async (req, res, next) => {
  try {
    const updated = await markAllRead(currentUser(req).id);
    ok(res, { updated });
  } catch (cause) {
    next(cause);
  }
});

/**
 * Marca una notificación como leída (acción explícita — decisión 4).
 * Si la notificación no existe o no pertenece al usuario, devuelve 404.
 * Si ya estaba leída, no hace nada (idempotente) pero devuelve 200.
 */
notificationsRouter.patch('/me/notifications/:id/read', authenticate, async (req, res, next) => {
  try {
    const notification = await markRead(currentUser(req).id, parseId(req.params.id));
    if (!notification) throw Errors.notFound('Notification');
    ok(res, notification);
  } catch (cause) {
    next(cause);
  }
});