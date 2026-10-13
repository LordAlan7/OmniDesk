import { Router } from 'express';
import { findUserById } from '../users';
import { Errors } from '../../shared/errors';
import { ok } from '../../shared/http';
import { authenticate, currentUser } from '../../shared/security/guards';
import { recordAudit } from '../audit';
import { loginSchema } from './auth.schemas';
import { login } from './auth.service';

export const authRouter = Router();

authRouter.post('/auth/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  ok(res, await login(email, password));
});

authRouter.get('/auth/me', authenticate, (req, res) => {
  const me = findUserById(currentUser(req).id);
  if (!me || !me.active) throw Errors.unauthorized('The account is no longer active.');
  ok(res, me);
});

// JWT sin estado: el cliente descarta el token; aquí solo se deja trazabilidad.
authRouter.post('/auth/logout', authenticate, (req, res) => {
  const user = currentUser(req);
  recordAudit({ action: 'auth.logout', entity: 'user', entityId: user.id, actorId: user.id });
  res.status(204).end();
});
