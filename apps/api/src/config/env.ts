import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const jwtSecret =
  process.env.JWT_SECRET ?? (isProduction ? undefined : 'dev-only-insecure-secret');
if (!jwtSecret) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production');
}

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  /** Coste de bcrypt (NFR-002). Mínimo 12 en producción; bajo en pruebas por velocidad. */
  bcryptCost: Number(
    process.env.BCRYPT_COST ?? (isProduction ? 12 : nodeEnv === 'test' ? 4 : 10),
  ),
  /** Límite de intentos de login por IP y ventana (NFR-002). */
  loginRateLimit: {
    windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    max: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? (nodeEnv === 'test' ? 1000 : 10)),
  },
  /** Límite general por IP sobre toda la API. */
  apiRateLimit: {
    windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60 * 1000),
    max: Number(process.env.API_RATE_LIMIT_MAX ?? (nodeEnv === 'test' ? 100000 : 300)),
  },
  /** Cantidad de proxies de confianza (para IP real y detección de HTTPS). */
  trustProxy: Number(process.env.TRUST_PROXY ?? (isProduction ? 1 : 0)),

  // ──────────────────────────────────────────────────────────────────────────
  // NFR-008: Escalabilidad — pool de conexiones PostgreSQL
  // ──────────────────────────────────────────────────────────────────────────
  // El driver `pg` crea un pool de conexiones. El tamaño del pool limita cuántas
  // consultas concurrentes pueden ejecutarse contra la base de datos.
  //
  // Defaults:
  // - Máximo de conexiones: 10 (default del driver pg).
  //   - Con < 6 técnicos y < 50 tickets/semana, 10 conexiones son suficientes
  //     incluso con varias peticiones concurrentes por usuario.
  //   - Si se amplía a más instancias de la API, cada una abre su propio pool.
  //     Calcular: max_instances × dbPoolMax ≤ max_connections del servidor PG.
  //   - PostgreSQL acepta por defecto 100 conexiones; con 10 por instancia, caben 10
  //     instancias. Más allá, subir max_connections del servidor o reducir dbPoolMax.
  //
  // - Timeout de conexión: 30s (default del driver pg).
  //   - Si la BD no responde en 30s, la petición falla en lugar de colgarse.
  //   - En producción conviene bajarlo (p. ej. 5-10s) para fallar rápido.
  //
  // Ver docs/NFR-008-Scalability.md para la matriz de ampliación.
  databaseUrl: process.env.DATABASE_URL,
  dbPoolMax: Number(process.env.DB_POOL_MAX ?? 10),
  dbConnectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 30000),

  openAiApiKey: process.env.OPENAI_API_KEY,
  /** Adaptadores externos: 'mock' / 'memory' no llaman a ningún servicio real. */
  aiProvider: process.env.AI_PROVIDER ?? 'mock',
  storageProvider: process.env.STORAGE_PROVIDER ?? 'memory',
  /** Usuarios de demostración (solo desarrollo/pruebas). */
  seedDemoData: !isProduction,
};