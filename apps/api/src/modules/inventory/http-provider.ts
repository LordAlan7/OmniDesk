import { env } from '../../config/env';
import { currentCorrelationId } from '../../shared/context/requestContext';
import { AppError, Errors } from '../../shared/errors';
import type { ZodType } from 'zod';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';
import { InventoryErrors, mapInventoryStatus } from './inventory-errors';
import {
  compatibleListSchema,
  eventListSchema,
  productFiltersSchema,
  productListSchema,
  productSchema,
  stockResponseSchema,
  uuidSchema,
  vehicleModelListSchema,
  vehicleModelSchema,
  vehicleSchema,
  vinSchema,
  warrantySchema,
} from './inventory.schemas';
import {
  computeStockLevel,
  type InventoryCompatibleProduct,
  type InventoryListMeta,
  type InventoryProduct,
  type InventoryProductFilters,
  type InventoryProvider,
  type InventoryStock,
  type InventoryVehicle,
  type InventoryVehicleEvent,
  type InventoryVehicleModel,
  type InventoryWarranty,
} from './inventory.types';

type CacheKind = 'models' | 'compat' | 'entity';

/**
 * Paso 13: log de cada intento saliente. Solo ruta etiquetada, estado, latencia y requestId:
 * nunca la URL real (lleva el VIN), la credencial ni el cuerpo.
 */
function logCall(
  route: string,
  attempt: number,
  outcome: number | 'network',
  ms: number,
  errorName?: string,
): void {
  if (!env.inventoryLogCalls) return;
  const fields = {
    route,
    attempt,
    outcome,
    ms,
    requestId: currentCorrelationId() ?? 'req-no-context',
    ...(errorName ? { error: errorName } : {}),
  };
  if (typeof outcome === 'number' && outcome < 400) console.info('[inventory] GET', fields);
  else console.warn('[inventory] GET', fields);
}

/** Paso 13: ruta sin VIN, códigos, IDs ni query, segura para mensajes de error y logs. */
function routeLabel(path: string): string {
  return path
    .split('?')[0]
    .replace(/\/by-vin\/[^/]+/, '/by-vin/:vin')
    .replace(/\/by-code\/[^/]+/, '/by-code/:value')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return undefined;
}

/**
 * Adaptador HTTP de la API de Inventario (contrato v1.0).
 * §9: timeout por petición, 1 reintento en GET ante red/5xx (el 429 no se reintenta),
 * circuit breaker y caché TTL por tipo de dato (el stock nunca se cachea).
 */
export class HttpInventoryProvider implements InventoryProvider {
  private readonly breaker = new CircuitBreaker(
    env.inventoryCircuitThreshold,
    env.inventoryCircuitResetMs,
  );
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();

  // ── Infraestructura interna ────────────────────────────────────────────

  private cacheGet<T>(kind: CacheKind, key: string): T | undefined {
    const entry = this.cache.get(`${kind}:${key}`);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(`${kind}:${key}`);
      return undefined;
    }
    return entry.value as T;
  }

  private cacheSet(kind: CacheKind, key: string, value: unknown, ttlS: number): void {
    if (ttlS <= 0) return;
    this.cache.set(`${kind}:${key}`, { value, expiresAt: Date.now() + ttlS * 1000 });
  }

  /** GET con headers §7, timeout, reintento (red/5xx/429) y circuit breaker. */
  private async getJson(path: string): Promise<unknown> {
    try {
      this.breaker.ensureAvailable();
    } catch (error) {
      if (error instanceof CircuitOpenError) throw InventoryErrors.unavailable();
      throw error;
    }

    const url = `${env.inventoryApiUrl}${path}`;
    const maxAttempts = 1 + Math.max(0, env.inventoryMaxRetries);
    let lastError: AppError = InventoryErrors.unavailable();

    const label = routeLabel(path);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            // §2: la credencial vive solo aquí, en el backend (nunca en el navegador).
            Authorization: `Device ${env.inventoryApiCredential}`,
            Accept: 'application/json',
            'X-Request-Id': currentCorrelationId() ?? 'req-no-context',
            'X-Caller': 'support-backend',
          },
          signal: AbortSignal.timeout(env.inventoryTimeoutMs),
          // Paso 13: inventario no debe redirigir; si lo hace, algo está mal y no se sigue.
          redirect: 'error',
        });

        logCall(label, attempt, response.status, Date.now() - startedAt);
        if (response.status === 429) throw mapInventoryStatus(429); // §9: no se reintenta
        if (response.status >= 500) {
          lastError = mapInventoryStatus(response.status);
          continue; // reintentable (§9)
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw InventoryErrors.contractMismatch(`respuesta no-JSON en ${routeLabel(path)}`);
        }

        if (!response.ok) {
          throw mapInventoryStatus(response.status, extractMessage(body));
        }

        this.breaker.recordSuccess();
        return body;
      } catch (error) {
        if (error instanceof AppError) throw error; // ya mapeado (4xx / mismatch)
        logCall(
          label,
          attempt,
          'network',
          Date.now() - startedAt,
          error instanceof Error ? error.name : 'unknown',
        );
        lastError = InventoryErrors.unavailable(); // red, DNS, timeout...
      }
    }

    this.breaker.recordFailure();
    throw lastError;
  }

  /** Valida un parámetro de entrada y lo devuelve normalizado (§10). */
  private assertValid<T>(schema: ZodType<T>, value: unknown, field: string): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw Errors.validation([
        { field, message: result.error.issues[0]?.message ?? 'Valor inválido.' },
      ]);
    }
    return result.data;
  }

  /** Valida la respuesta contra el contrato; si no calza → CONTRACT_MISMATCH (§8). */
  private parse<T>(schema: ZodType<T>, body: unknown, what: string): T {
    const result = schema.safeParse(body);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw InventoryErrors.contractMismatch(
        `${what} (${issue?.path.join('.') ?? 'raíz'}: ${issue?.message ?? 'formato inesperado'})`,
      );
    }
    return result.data;
  }

  // ── API pública (InventoryProvider) ────────────────────────────────────

  async getVehicleByVin(vin: string): Promise<InventoryVehicle> {
    const normalized = this.assertValid(vinSchema, vin, 'vin');
    const key = `vin:${normalized}`;
    const cached = this.cacheGet<InventoryVehicle>('entity', key);
    if (cached) return cached;
    const vehicle = this.parse(
      vehicleSchema,
      await this.getJson(`/vehicles/by-vin/${encodeURIComponent(normalized)}`),
      'vehicles/by-vin/:vin',
    );
    this.cacheSet('entity', key, vehicle, env.inventoryCacheEntityTtlS);
    return vehicle;
  }

  async getVehicleById(id: string): Promise<InventoryVehicle> {
    const uuid = this.assertValid(uuidSchema, id, 'id');
    const key = `vehicle:${uuid}`;
    const cached = this.cacheGet<InventoryVehicle>('entity', key);
    if (cached) return cached;
    const vehicle = this.parse(
      vehicleSchema,
      await this.getJson(`/vehicles/${uuid}`),
      'vehicles/:id',
    );
    this.cacheSet('entity', key, vehicle, env.inventoryCacheEntityTtlS);
    return vehicle;
  }

  async getVehicleEvents(id: string): Promise<InventoryVehicleEvent[]> {
    const uuid = this.assertValid(uuidSchema, id, 'id');
    return this.parse(
      eventListSchema,
      await this.getJson(`/vehicles/${uuid}/events`),
      'vehicles/:id/events',
    );
  }

  async getVehicleWarranty(id: string): Promise<InventoryWarranty> {
    const uuid = this.assertValid(uuidSchema, id, 'id');
    return this.parse(
      warrantySchema,
      await this.getJson(`/vehicles/${uuid}/warranty`),
      'vehicles/:id/warranty',
    );
  }

  async getCompatibleProducts(id: string): Promise<InventoryCompatibleProduct[]> {
    const uuid = this.assertValid(uuidSchema, id, 'id');
    const key = `compat:${uuid}`;
    const cached = this.cacheGet<InventoryCompatibleProduct[]>('compat', key);
    if (cached) return cached;
    const body = this.parse(
      compatibleListSchema,
      await this.getJson(`/vehicles/${uuid}/compatible-products`),
      'vehicles/:id/compatible-products',
    );
    const products: InventoryCompatibleProduct[] = body.data.map((row) => {
      const stockTotal = row.stock.reduce((sum, s) => sum + s.quantity, 0);
      const { stock, ...product } = row;
      return {
        ...product,
        stockTotal,
        stockLevel: computeStockLevel(stockTotal, env.inventoryLowStockThreshold),
      };
    });
    this.cacheSet('compat', key, products, env.inventoryCacheCompatTtlS);
    return products;
  }

  async listProducts(
    filters: InventoryProductFilters = {},
  ): Promise<{ data: InventoryProduct[]; meta: InventoryListMeta }> {
    const query = this.assertValid(productFiltersSchema, filters, 'filters');
    const params = new URLSearchParams();
    // La API real usa `q` como búsqueda libre (contrato §3: `search`).
    if (query.search) params.set('q', query.search);
    if (query.categoryId) params.set('categoryId', query.categoryId);
    // Nota: hoy la API ignora page/limit (devuelve 100); se pasan para cuando los soporte.
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return this.parse(productListSchema, await this.getJson(`/products${suffix}`), 'products');
  }

  async getProductByCode(value: string): Promise<InventoryProduct> {
    const code = value.trim();
    if (!code) {
      throw Errors.validation([{ field: 'code', message: 'El código es obligatorio.' }]);
    }
    const key = `product-code:${code}`;
    const cached = this.cacheGet<InventoryProduct>('entity', key);
    if (cached) return cached;
    const product = this.parse(
      productSchema,
      await this.getJson(`/products/by-code/${encodeURIComponent(code)}`),
      'products/by-code/:value',
    );
    this.cacheSet('entity', key, product, env.inventoryCacheEntityTtlS);
    return product;
  }

  async getProductById(id: string): Promise<InventoryProduct> {
    const uuid = this.assertValid(uuidSchema, id, 'id');
    const key = `product:${uuid}`;
    const cached = this.cacheGet<InventoryProduct>('entity', key);
    if (cached) return cached;
    const product = this.parse(
      productSchema,
      await this.getJson(`/products/${uuid}`),
      'products/:id',
    );
    this.cacheSet('entity', key, product, env.inventoryCacheEntityTtlS);
    return product;
  }

  async getProductStock(id: string): Promise<InventoryStock> {
    const uuid = this.assertValid(uuidSchema, id, 'id');
    // §9: el stock nunca se cachea.
    const body = this.parse(
      stockResponseSchema,
      await this.getJson(`/products/${uuid}/stock`),
      'products/:id/stock',
    );
    return {
      productId: body.productId,
      total: body.total,
      locations: body.locations.map((row) => ({
        location: row.location,
        quantity: row.quantity,
        level: computeStockLevel(row.quantity, env.inventoryLowStockThreshold),
      })),
    };
  }

  async listVehicleModels(): Promise<InventoryVehicleModel[]> {
    const cached = this.cacheGet<InventoryVehicleModel[]>('models', 'all');
    if (cached) return cached;
    const models = this.parse(
      vehicleModelListSchema,
      await this.getJson('/vehicle-models'),
      'vehicle-models',
    );
    this.cacheSet('models', 'all', models, env.inventoryCacheModelsTtlS);
    return models;
  }

  async getVehicleModelById(id: string): Promise<InventoryVehicleModel> {
    const uuid = this.assertValid(uuidSchema, id, 'id');
    const key = `model:${uuid}`;
    const cached = this.cacheGet<InventoryVehicleModel>('models', key);
    if (cached) return cached;
    const model = this.parse(
      vehicleModelSchema,
      await this.getJson(`/vehicle-models/${uuid}`),
      'vehicle-models/:id',
    );
    this.cacheSet('models', key, model, env.inventoryCacheModelsTtlS);
    return model;
  }
}