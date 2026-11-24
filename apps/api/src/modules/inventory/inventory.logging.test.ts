/** Paso 13.5 · Log saliente: ruta etiquetada, estado, latencia y requestId; sin VIN ni credencial. */
import { runWithRequestContext } from '../../shared/context/requestContext';

const VIN = 'MD2A1AAX5RWA00004';

process.env.INVENTORY_PROVIDER = 'http';
process.env.INVENTORY_API_URL = 'http://inventory.test';
process.env.INVENTORY_API_CREDENTIAL = 'test-device-credential';
process.env.INVENTORY_TIMEOUT_MS = '50';
process.env.INVENTORY_MAX_RETRIES = '0';
process.env.INVENTORY_CIRCUIT_THRESHOLD = '50';
process.env.INVENTORY_LOG_CALLS = 'true';

const realFetch = global.fetch;
afterAll(() => {
  global.fetch = realFetch;
});

type LogCall = [string, Record<string, unknown>];

describe('Paso 13.5 · log de llamadas salientes', () => {
  let provider: import('./inventory.types').InventoryProvider;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const { createInventoryProvider } = await import('./index');
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = createInventoryProvider('http');
  });

  afterEach(() => jest.restoreAllMocks());

  it('registra ruta sin VIN, estado, latencia y requestId', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await runWithRequestContext({ requestId: 'req-123' }, () =>
      provider.getVehicleByVin(VIN),
    ).catch(() => undefined);

    expect(warn).toHaveBeenCalledTimes(1);
    const [message, fields] = warn.mock.calls[0] as LogCall;
    expect(message).toBe('[inventory] GET');
    expect(fields).toMatchObject({
      route: '/vehicles/by-vin/:vin',
      attempt: 1,
      outcome: 404,
      requestId: 'req-123',
    });
    expect(typeof fields.ms).toBe('number');

    const serialized = JSON.stringify(warn.mock.calls);
    expect(serialized).not.toContain(VIN);
    expect(serialized).not.toContain('test-device-credential');
  });

  it('registra los fallos de red con el nombre del error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await provider.getVehicleByVin(VIN).catch(() => undefined);

    const [, fields] = warn.mock.calls[0] as LogCall;
    expect(fields).toMatchObject({ outcome: 'network', error: 'TypeError' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(VIN);
  });
});