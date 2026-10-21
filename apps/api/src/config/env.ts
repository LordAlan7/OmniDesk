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
  databaseUrl: process.env.DATABASE_URL,
  openAiApiKey: process.env.OPENAI_API_KEY,
  /** Adaptadores externos: 'mock' / 'memory' no llaman a ningún servicio real. */
  aiProvider: process.env.AI_PROVIDER ?? 'mock',
  storageProvider: process.env.STORAGE_PROVIDER ?? 'memory',
  /** Usuarios de demostración (solo desarrollo/pruebas). */
  seedDemoData: !isProduction,
};
