import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env';

function limiter(options: { windowMs: number; max: number }, message: string) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: { code: 'TOO_MANY_REQUESTS', message, requestId: req.requestId },
      });
    },
  });
}

/** Límite general de la API por IP (NFR-002). */
export const apiRateLimiter = limiter(
  env.apiRateLimit,
  'Too many requests. Please try again later.',
);

/** Límite estricto para intentos de login por IP (NFR-002). */
export const loginRateLimiter = limiter(
  env.loginRateLimit,
  'Too many login attempts. Please try again later.',
);
