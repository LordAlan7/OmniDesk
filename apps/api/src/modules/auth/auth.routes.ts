import { Router } from 'express';
import { findUserById } from '../users';
import { Errors } from '../../shared/errors';
import { ok } from '../../shared/http';
import {
  authenticate,
  currentUser,
} from '../../shared/security/guards';
import { recordAudit } from '../audit';
import { loginSchema } from './auth.schemas';
import { login } from './auth.service';

export const authRouter = Router();

// Iniciar sesión.
authRouter.post(
  '/auth/login',
  async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      ok(res, await login(email, password));
    } catch (cause) {
      next(cause);
    }
  },
);

// Consultar el perfil actual desde el repositorio de usuarios.
authRouter.get(
  '/auth/me',
  authenticate,
  async (req, res, next) => {
    try {
      const me = await findUserById(currentUser(req).id);

      if (!me || !me.active) {
        throw Errors.unauthorized(
          'The account is no longer active.',
        );
      }

      ok(res, me);
    } catch (cause) {
      next(cause);
    }
  },
);

// Registrar el cierre de sesión.
// El cliente descarta su token.
authRouter.post(
  '/auth/logout',
  authenticate,
  (req, res) => {
    const user = currentUser(req);

    recordAudit({
      action: 'auth.logout',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
    });

    res.status(204).end();
  },
);