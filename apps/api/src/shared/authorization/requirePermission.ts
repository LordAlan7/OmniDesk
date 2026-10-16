import type { RequestHandler } from 'express';
import { Errors } from '../errors';
import { currentUser } from '../security/guards';
import type { Permission } from './permissions';
import { can } from './policy';

/**
 * Middleware: exige que el usuario autenticado tenga el permiso indicado.
 * Uso: router.post('/users', authenticate, requirePermission(PERMISSIONS.USERS_CREATE), handler)
 *
 * Debe colocarse SIEMPRE después de `authenticate`.
 */
export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    const user = currentUser(req);
    if (!can(user, permission)) return next(Errors.forbidden());
    next();
  };
