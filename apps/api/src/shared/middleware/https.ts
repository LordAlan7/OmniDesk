import type { RequestHandler } from 'express';
import { env } from '../../config/env';

/** En producción redirige HTTP a HTTPS (requiere trust proxy para leer req.secure). */
export const enforceHttps: RequestHandler = (req, res, next) => {
  if (!env.isProduction || req.secure) {
    next();
    return;
  }

  res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
};
