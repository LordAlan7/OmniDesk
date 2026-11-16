import { Pool } from 'pg';
import { env } from '../../config/env';

let pool: Pool | undefined;

/**
 * Conexión a PostgreSQL (lazy).
 *
 * NFR-008 (Escalabilidad):
 * - El pool se crea una vez por proceso y se reutiliza en todas las peticiones.
 * - El tamaño del pool (`max`) se configura con `DB_POOL_MAX` (default 10).
 * - Cada petición que necesita la BD toma una conexión del pool; al terminar, la devuelve.
 * - Si todas las conexiones están en uso, la petición espera (no abre una nueva).
 * - Si la espera supera `connectionTimeoutMillis`, la petición falla.
 *
 * Cálculo de capacidad (ver docs/NFR-008-Scalability.md):
 * - Con DB_POOL_MAX=10 y ~5 conexiones concurrentes en pico, el pool no se satura.
 * - Si se ejecutan varias instancias de la API detrás de un balanceador:
 *     total_conexiones = num_instancias × DB_POOL_MAX
 *     debe ser ≤ max_connections del servidor PostgreSQL (default 100).
 * - Para 10 instancias: 10 × 10 = 100 = límite del servidor. A partir de ahí,
 *   subir max_connections del servidor o reducir DB_POOL_MAX.
 */
export function getPool(): Pool {
  if (!env.databaseUrl) throw new Error('DATABASE_URL is not configured');
  pool ??= new Pool({
    connectionString: env.databaseUrl,
    max: env.dbPoolMax,
    connectionTimeoutMillis: env.dbConnectionTimeoutMillis,
  });
  return pool;
}
/**
 * NFR-004: Health check de la base de datos.
 * Verifica que la conexión a PostgreSQL esté activa.
 */
export async function checkDatabaseHealth(): Promise<'connected' | 'error'> {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return 'connected';
  } catch {
    return 'error';
  }
}