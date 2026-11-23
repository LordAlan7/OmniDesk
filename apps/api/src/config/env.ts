
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

  // NFR-008: Escalabilidad — pool de conexiones PostgreSQL
  databaseUrl: process.env.DATABASE_URL,

  dbPoolMax: Number(process.env.DB_POOL_MAX ?? 10),
  dbConnectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 30000),

  // API externa de Inventario
  inventoryApiUrl: process.env.INVENTORY_API_URL ?? 'http://localhost:3001',
  inventoryApiCredential: process.env.INVENTORY_API_CREDENTIAL,

  openAiApiKey: process.env.OPENAI_API_KEY,

  /** Adaptadores externos: 'mock' / 'memory' no llaman a ningún servicio real. */
  aiProvider: process.env.AI_PROVIDER ?? 'mock',

  /**
   * AIR-001: modelo de chat usado por el proveedor OpenAI.
   * El resto del código NO lo lee: solo lo usa providers/openai-provider.ts
   * a través de env.aiOpenAiModel.
   */
  aiOpenAiModel: process.env.AI_OPENAI_MODEL ?? 'gpt-4o-mini',

  storageProvider: process.env.STORAGE_PROVIDER ?? 'memory',

  /** Usuarios de demostración (solo desarrollo/pruebas). */
  seedDemoData: !isProduction,
};
