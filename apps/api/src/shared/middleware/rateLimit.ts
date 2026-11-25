import type { Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env';

function limiter(
  options: { windowMs: number; max: number } | any,
  message: string,
  keyGenerator?: (req: Request) => string,
) {
  // Si por alguna razón options no tiene windowMs, usamos valores por defecto
  const windowMs = options?.windowMs ?? 15 * 60 * 1000;
  const max = options?.max ?? 100;

  return rateLimit({
    ...(keyGenerator ? { keyGenerator } : {}),
    windowMs,
    limit: max,
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

export const aiRateLimiter = limiter(
  env.apiRateLimit,  // <--- Cambiamos 'aiRateLimit' por 'apiRateLimit'
  'Too many assistant queries. Please wait a moment before asking again.',
  (req) => `ai-user-${req.user?.id ?? 'anonymous'}`,
);