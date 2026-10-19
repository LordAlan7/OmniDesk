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
  databaseUrl: process.env.DATABASE_URL,
  openAiApiKey: process.env.OPENAI_API_KEY,
  /** Adaptadores externos: 'mock' / 'memory' no llaman a ningún servicio real. */
  aiProvider: process.env.AI_PROVIDER ?? 'mock',
  storageProvider: process.env.STORAGE_PROVIDER ?? 'memory',
  /** Usuarios de demostración (solo desarrollo/pruebas). */
  seedDemoData: !isProduction,
};
