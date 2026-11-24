/**
 * Paso 5 · Resiliencia, caché y fallos (INVENTORY-CONTRACT.md §7-§9).
 *
 * Ejercita HttpInventoryProvider sin red: fetch se sustituye por un stub.
 * El provider lee config/env al cargar el módulo, así que las variables
 * INVENTORY_* se fijan aquí arriba (los `import type` no emiten require)
 * y el módulo se carga con import() dinámico dentro de beforeAll.
 */
import type { InventoryProvider } from './inventory.types';

const VIN = 'MD2A1AAX5RWA00004';

// ── Entorno propio del suite: valores rápidos para no esperar los de §9 ──────
const ENV_KEYS = [
  'INVENTORY_PROVIDER',
  'INVENTORY_API_URL',
  'INVENTORY_API_CREDENTIAL',
  'INVENTORY_TIMEOUT_MS',
  'INVENTORY_MAX_RETRIES',
  'INVENTORY_CIRCUIT_THRESHOLD',
  'INVENTORY_CIRCUIT_RESET_MS',
  'INVENTORY_CACHE_MODELS_TTL_S',
] as const;

const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

process.env.INVENTORY_PROVIDER = 'http';
process.env.INVENTORY_API_URL = 'http://inventory.test';
process.env.INVENTORY_API_CREDENTIAL = 'test-device-credential';
process.env.INVENTORY_TIMEOUT_MS = '50';
process.env.INVENTORY_MAX_RETRIES = '1';
process.env.INVENTORY_CIRCUIT_THRESHOLD = '2';
process.env.INVENTORY_CIRCUIT_RESET_MS = '200';
process.env.INVENTORY_CACHE_MODELS_TTL_S = '60';

const realFetch = global.fetch;

afterAll(() => {
  global.fetch = realFetch;
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const upstreamError = (status: number, code: string): unknown => ({
  statusCode: status,
  code,
  message: 'Error simulado del proveedor',
  requestId: 'req-test',
});

/** Forma real de GET /vehicle-models (Prisma crudo + _count): el adaptador debe quedarse solo con lo de §4. */
const MODELS_BODY = {
  data: [
    {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      brand: 'Honda',
      model: 'CBR600RR',
      yearFrom: 2019,
      yearTo: 2024,
      engineCc: 600,
      status: 'ACTIVE',
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-01-15T10:00:00.000Z',
      _count: { units: 4, compatibleProducts: 12 },
    },
  ],
  meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

/** Lista o envoltorio { data, meta }: normaliza para no depender de la firma exacta. */
const asList = (result: unknown): unknown[] =>
  Array.isArray(result) ? result : ((result as { data?: unknown[] }).data ?? []);

async function catchError(fn: () => Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await fn();
  } catch (error) {
    const appError = error as { status?: number; code?: string };
    return { status: appError.status ?? -1, code: appError.code ?? 'UNKNOWN' };
  }
  throw new Error('Se esperaba que la llamada fallara');
}

describe('Paso 5 · HttpInventoryProvider: resiliencia, caché y fallos (§7-§9)', () => {
  let createProvider: typeof import('./index').createInventoryProvider;
  let provider: InventoryProvider;
  let fetchMock: jest.Mock;

  beforeAll(async () => {
    ({ createInventoryProvider: createProvider } = await import('./index'));
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = createProvider();
  });

  it('§8 · fallo de red → 503 INVENTORY_UNAVAILABLE y reintenta una vez (§9)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const err = await catchError(() => provider.getVehicleByVin(VIN));
    expect(err.status).toBe(503);
    expect(err.code).toBe('INVENTORY_UNAVAILABLE');
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 intento + 1 reintento (GET)
  });

  it('§8 · timeout → 503 INVENTORY_UNAVAILABLE', async () => {
    // Nunca responde y honra el abort del signal, como el fetch real.
    fetchMock.mockImplementation(
      (_input: unknown, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('This operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }),
    );
    const err = await catchError(() => provider.getVehicleByVin(VIN));
    expect(err.status).toBe(503);
    expect(err.code).toBe('INVENTORY_UNAVAILABLE');
  });

  it('§8 · 400 del proveedor → 400 INVENTORY_BAD_REQUEST', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, upstreamError(400, 'BAD_REQUEST')));
    const err = await catchError(() => provider.getVehicleByVin(VIN));
    expect(err.status).toBe(400);
    expect(err.code).toBe('INVENTORY_BAD_REQUEST');
  });

  it('§8 · 401/403 de la credencial → 502 INVENTORY_AUTH_FAILED (sin cerrar sesión)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, upstreamError(403, 'FORBIDDEN')));
    const err = await catchError(() => provider.getVehicleByVin(VIN));
    expect(err.status).toBe(502);
    expect(err.code).toBe('INVENTORY_AUTH_FAILED');
  });

  it('§8 · 404 → 404 INVENTORY_NOT_FOUND', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, upstreamError(404, 'NOT_FOUND')));
    const err = await catchError(() => provider.getVehicleByVin(VIN));
    expect(err.status).toBe(404);
    expect(err.code).toBe('INVENTORY_NOT_FOUND');
  });

  it('§8 · 429 → 503 INVENTORY_RATE_LIMITED', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, upstreamError(429, 'TOO_MANY_REQUESTS')));
    const err = await catchError(() => provider.getVehicleByVin(VIN));
    expect(err.status).toBe(503);
    expect(err.code).toBe('INVENTORY_RATE_LIMITED');
  });

  it('§8 · respuesta fuera de contrato → 502 INVENTORY_CONTRACT_MISMATCH', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { unexpected: true }));
    const err = await catchError(() => provider.getVehicleByVin(VIN));
    expect(err.status).toBe(502);
    expect(err.code).toBe('INVENTORY_CONTRACT_MISMATCH');
  });

  it('§7 · headers salientes: Authorization Device, Accept y X-Caller', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, upstreamError(404, 'NOT_FOUND')));
    await catchError(() => provider.getVehicleByVin(VIN));
    const [url, init] = fetchMock.mock.calls[0] as [unknown, { headers?: unknown } | undefined];
    expect(String(url)).toContain('http://inventory.test');
    expect(String(url)).toContain(`/vehicles/by-vin/${VIN}`);
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Device test-device-credential');
    expect(headers.get('accept')).toContain('application/json');
    expect(headers.get('x-caller')).toBe('support-backend');
  });

  it('§9 · circuit breaker: abre tras los fallos y la siguiente llamada no toca la red', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, upstreamError(500, 'INTERNAL_ERROR')));
    expect((await catchError(() => provider.getVehicleByVin(VIN))).code).toBe('INVENTORY_UNAVAILABLE');
    expect((await catchError(() => provider.getVehicleByVin(VIN))).code).toBe('INVENTORY_UNAVAILABLE');
    const callsWhenOpen = fetchMock.mock.calls.length;
    expect(callsWhenOpen).toBeGreaterThan(0);

    const third = await catchError(() => provider.getVehicleByVin(VIN));
    expect(third.status).toBe(503);
    expect(third.code).toBe('INVENTORY_UNAVAILABLE');
    expect(fetchMock.mock.calls.length).toBe(callsWhenOpen); // falla rápido, sin red
  });

  it('§9 · circuit breaker: semiabierto tras la ventana y cierra con éxito', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, upstreamError(500, 'INTERNAL_ERROR')));
    await catchError(() => provider.getVehicleByVin(VIN));
    await catchError(() => provider.getVehicleByVin(VIN));
    const callsWhenOpen = fetchMock.mock.calls.length;

    // Espera la ventana de reset (INVENTORY_CIRCUIT_RESET_MS = 200) y cambia a éxito.
    await new Promise((resolve) => setTimeout(resolve, 250));
    fetchMock.mockResolvedValue(jsonResponse(200, MODELS_BODY));
    await expect(provider.listVehicleModels()).resolves.toBeDefined(); // el intento pasa
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsWhenOpen);
  });

  it('§9 · caché de modelos: dos llamadas, una sola ida a la red, sin campos ocultos', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, MODELS_BODY));
    const first = asList(await provider.listVehicleModels());
    expect(first.length).toBe(1);
    expect(first[0]).not.toHaveProperty('createdAt'); // ocultos de §4
    expect(first[0]).not.toHaveProperty('_count');
    const second = asList(await provider.listVehicleModels());
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});