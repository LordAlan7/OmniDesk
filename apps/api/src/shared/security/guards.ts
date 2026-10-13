import type { RequestHandler } from 'express';
import { Errors } from '../errors';
import { AuthUser, Role, hasRole } from '../types';
import { verifyAccessToken } from './jwt';

/** Exige un JWT Bearer válido y deja el usuario en req.user. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return next(Errors.unauthorized('A Bearer token is required.'));
  }
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
    next();
  } catch {
    next(Errors.unauthorized('The token is invalid or has expired.'));
  }
};

/** RBAC en el servidor: el usuario debe tener al menos uno de los roles indicados. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(Errors.unauthorized());
    if (!hasRole(req.user, ...roles)) return next(Errors.forbidden());
    next();
  };

/** Devuelve req.user o lanza 401 (para usar dentro de controladores). */
export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw Errors.unauthorized();
  return req.user;
}
