import type { Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env';

function limiter(
  options: { windowMs: number; max: number },
  message: string,
  keyGenerator?: (req: Request) => string,
) {
  return rateLimit({
    ...(keyGenerator ? { keyGenerator } : {}),
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

/** Límite de consultas al asistente por USUARIO (FR-013). Va después de `authenticate`. */
export const aiRateLimiter = limiter(
  env.aiRateLimit,
  'Too many assistant queries. Please wait a moment before asking again.',
  (req) => `ai-user-${req.user?.id ?? 'anonymous'}`,
);
