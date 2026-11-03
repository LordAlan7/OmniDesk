import { RequestHandler } from 'express';
import { checkDatabaseHealth } from '../db/pool';

/**
 * NFR-004: Endpoint de health check con verificación de base de datos.
 */
export const healthCheck: RequestHandler = async (_req, res) => {
  const dbStatus = await checkDatabaseHealth();
  const isHealthy = dbStatus === 'connected';

  res.status(isHealthy ? 200 : 503).json({
    data: {
      status: isHealthy ? 'ok' : 'degraded',
      service: 'omnidesk-api',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    },
  });
};