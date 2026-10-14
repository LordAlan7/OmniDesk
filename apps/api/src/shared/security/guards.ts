import type { RequestHandler } from 'express';
import { Errors } from '../errors';
import { AuthUser, Role, hasRole } from '../types';
import { verifyAccessToken } from './jwt';

type AccountResolver = (
  id: number,
) => (AuthUser & { active: boolean }) | undefined;

let resolveAccount: AccountResolver | undefined;

export function configureAccountResolver(
  resolver: AccountResolver,
): void {
  resolveAccount = resolver;
}

// Valida el token y consulta el estado actual de la cuenta.
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    return next(
      Errors.unauthorized('A Bearer token is required.'),
    );
  }

  try {
    const tokenUser = verifyAccessToken(
      header.slice('Bearer '.length),
    );

    if (!resolveAccount) {
      return next(
        Errors.unauthorized('Account validation is unavailable.'),
      );
    }

    const account = resolveAccount(tokenUser.id);

    if (!account || !account.active) {
      return next(
        Errors.unauthorized('La cuenta no existe o está desactivada.'),
      );
    }

    req.user = {
      id: account.id,
      email: account.email,
      name: account.name,
      roles: [...account.roles],
    };
  } catch {
    return next(
      Errors.unauthorized('The token is invalid or has expired.'),
    );
  }

  next();
};

// Aplica los roles actuales de la cuenta.
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      return next(Errors.unauthorized());
    }

    if (!hasRole(req.user, ...roles)) {
      return next(Errors.forbidden());
    }

    next();
  };

export function currentUser(
  req: { user?: AuthUser },
): AuthUser {
  if (!req.user) throw Errors.unauthorized();

  return req.user;
}