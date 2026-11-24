import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const jwtSecret =
  process.env.JWT_SECRET ?? (isProduction ? undefined : 'dev-only-insecure-secret');
if (!jwtSecret) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production');
}

const inventoryProvider = process.env.INVENTORY_PROVIDER ?? 'mock';
const inventoryApiUrl = process.env.INVENTORY_API_URL;
const inventoryApiCredential = process.env.INVENTORY_API_CREDENTIAL;
if (inventoryProvider === 'http' && (!inventoryApiUrl || !inventoryApiCredential)) {
  throw new Error(
    'INVENTORY_API_URL and INVENTORY_API_CREDENTIAL are required when INVENTORY_PROVIDER=http',
  );
}

// Paso 13: la credencial viaja en cada petición, así que en producción solo se acepta HTTPS.
if (inventoryProvider === 'http') {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(inventoryApiUrl as string);
  } catch {
    throw new Error('INVENTORY_API_URL no es una URL válida');
  }
  if (isProduction && parsedUrl.protocol !== 'https:') {
    throw new Error('INVENTORY_API_URL debe usar https:// cuando NODE_ENV=production');
  }
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
  /**
   * AIR-001: modelo de chat usado por el proveedor OpenAI.
   * El resto del código NO lo lee: solo lo usa providers/openai-provider.ts
   * a través de `env.aiOpenAiModel`. Default 'gpt-4o-mini' (suficiente para
   * RAG interno de soporte). Cambiar solo con acuerdo del equipo.
   */
  aiOpenAiModel: process.env.AI_OPENAI_MODEL ?? 'gpt-4o-mini',
  storageProvider: process.env.STORAGE_PROVIDER ?? 'memory',

  // ──────────────────────────────────────────────────────────────────────────
  // Integración con la API de Inventario (INVENTORY-CONTRACT.md v1.0)
  // ──────────────────────────────────────────────────────────────────────────
  inventoryProvider,
  inventoryApiUrl,
  inventoryApiCredential,
  inventoryTimeoutMs: Number(process.env.INVENTORY_TIMEOUT_MS ?? 5000),
  inventoryMaxRetries: Number(process.env.INVENTORY_MAX_RETRIES ?? 1),
  inventoryCircuitThreshold: Number(process.env.INVENTORY_CIRCUIT_THRESHOLD ?? 5),
  inventoryCircuitResetMs: Number(process.env.INVENTORY_CIRCUIT_RESET_MS ?? 30000),
  inventoryCacheModelsTtlS: Number(process.env.INVENTORY_CACHE_MODELS_TTL_S ?? 600),
  inventoryCacheCompatTtlS: Number(process.env.INVENTORY_CACHE_COMPAT_TTL_S ?? 300),
  inventoryCacheEntityTtlS: Number(process.env.INVENTORY_CACHE_ENTITY_TTL_S ?? 60),
  inventoryLowStockThreshold: Number(process.env.INVENTORY_LOW_STOCK_THRESHOLD ?? 5),
  /** Paso 13: registra cada llamada saliente a inventario (ruta, estado, latencia, requestId). */
  inventoryLogCalls: process.env.INVENTORY_LOG_CALLS
    ? process.env.INVENTORY_LOG_CALLS === 'true'
    : nodeEnv !== 'test',

  /** Usuarios de demostración (solo desarrollo/pruebas). */
  seedDemoData: !isProduction,
};