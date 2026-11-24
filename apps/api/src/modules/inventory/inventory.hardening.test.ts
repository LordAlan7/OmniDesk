/**
 * Paso 13.4 · Endurecimiento del adaptador: 429 sin reintento, redirect: 'error'
 * y sin VIN en los mensajes de error.
 */
const VIN = 'MD2A1AAX5RWA00004';

process.env.INVENTORY_PROVIDER = 'http';
process.env.INVENTORY_API_URL = 'http://inventory.test';
process.env.INVENTORY_API_CREDENTIAL = 'test-device-credential';
process.env.INVENTORY_TIMEOUT_MS = '50';
process.env.INVENTORY_MAX_RETRIES = '1';
process.env.INVENTORY_CIRCUIT_THRESHOLD = '50';

const realFetch = global.fetch;
afterAll(() => {
  global.fetch = realFetch;
});

async function catchAppError(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    return error as { status: number; code: string; message: string };
  }
  throw new Error('Se esperaba que la llamada fallara');
}

describe('Paso 13.4 · HttpInventoryProvider', () => {
  let provider: import('./inventory.types').InventoryProvider;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const { createInventoryProvider } = await import('./index');
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = createInventoryProvider('http');
  });

  it('un 429 no se reintenta y se traduce a INVENTORY_RATE_LIMITED', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));
    const err = await catchAppError(() => provider.getVehicleByVin(VIN));
    expect(err.status).toBe(503);
    expect(err.code).toBe('INVENTORY_RATE_LIMITED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un 5xx sí se reintenta una vez', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    await catchAppError(() => provider.getVehicleByVin(VIN));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('el mensaje de "respuesta no-JSON" no contiene el VIN', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 200 }));
    const err = await catchAppError(() => provider.getVehicleByVin(VIN));
    expect(err.code).toBe('INVENTORY_CONTRACT_MISMATCH');
    expect(err.message).not.toContain(VIN);
    expect(err.message).toContain('/vehicles/by-vin/:vin');
  });

  it('el fetch se hace con redirect: "error"', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await catchAppError(() => provider.getVehicleByVin(VIN));
    const init = fetchMock.mock.calls[0][1] as { redirect?: string };
    expect(init.redirect).toBe('error');
  });
});