import { Router } from 'express';
import { ok } from '../../shared/http';
import {
  authenticate,
  currentUser,
} from '../../shared/security/guards';
import { loginRateLimiter } from '../../shared/middleware/rateLimit';
import { loginSchema } from './auth.schemas';
import { getProfile, login, logout } from './auth.service';

export const authRouter = Router();

authRouter.post(
  '/auth/login',
  loginRateLimiter,
  async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      ok(res, await login(email, password));
    } catch (cause) {
      next(cause);
    }
  },
);

authRouter.get(
  '/auth/me',
  authenticate,
  async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      ok(res, await getProfile(currentUser(req).id));
    } catch (cause) {
      next(cause);
    }
  },
);

authRouter.post(
  '/auth/logout',
  authenticate,
  (req, res) => {
    logout(currentUser(req).id);
    res.status(204).end();
  },
);
