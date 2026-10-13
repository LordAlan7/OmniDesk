import { Pool } from 'pg';
import { env } from '../../config/env';

let pool: Pool | undefined;

/**
 * Conexión a PostgreSQL (lazy). Hoy los repositorios son en memoria;
 * cuando se migre cada módulo, su repository usará getPool().
 */
export function getPool(): Pool {
  if (!env.databaseUrl) throw new Error('DATABASE_URL is not configured');
  pool ??= new Pool({ connectionString: env.databaseUrl });
  return pool;
}
