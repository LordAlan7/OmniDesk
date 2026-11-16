import type { RequestHandler } from 'express';
import { Errors } from '../errors';
import { AuthUser, Role, hasRole } from '../types';
import { verifyAccessToken } from './jwt';

type Account = AuthUser & { active: boolean };

type AccountResolver = (
  id: number,
) =>
  | Account
  | undefined
  | Promise<Account | undefined>;

let resolveAccount: AccountResolver | undefined;

export function configureAccountResolver(
  resolver: AccountResolver,
): void {
  resolveAccount = resolver;
}

// Valida el token y obtiene el estado y roles actuales.
export const authenticate: RequestHandler = async (
  req,
  _res,
  next,
) => {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    return next(
      Errors.unauthorized('A Bearer token is required.'),
    );
  }

  let tokenUser: AuthUser;

  try {
    tokenUser = verifyAccessToken(
      header.slice('Bearer '.length),
    );
  } catch {
    return next(
      Errors.unauthorized('The token is invalid or has expired.'),
    );
  }

  if (!resolveAccount) {
    return next(
      new Error('Account validation is unavailable.'),
    );
  }

  try {
    const account = await resolveAccount(tokenUser.id);

    if (!account || !account.active) {
      return next(
        Errors.unauthorized(
          'La cuenta no existe o está desactivada.',
        ),
      );
    }

    req.user = {
      id: account.id,
      email: account.email,
      name: account.name,
      roles: [...account.roles],
    };
  } catch (cause) {
    // Un fallo de conexión a la base de datos no es
    // un error de contraseña o de sesión.
    return next(cause);
  }

  next();
};

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