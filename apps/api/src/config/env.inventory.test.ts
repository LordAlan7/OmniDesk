/** Paso 13.4 · INVENTORY_API_URL debe ser HTTPS en producción. */
describe('env: INVENTORY_API_URL', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  function loadEnv(vars: Record<string, string>) {
    process.env = { ...saved, JWT_SECRET: 'secreto-de-prueba', ...vars };
    let mod: typeof import('./env') | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('./env');
    });
    return mod!;
  }

  const base = { INVENTORY_PROVIDER: 'http', INVENTORY_API_CREDENTIAL: 'cred' };

  it('rechaza http:// en producción', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', INVENTORY_API_URL: 'http://inventario.ejemplo.com' }),
    ).toThrow(/https/);
  });

  it('acepta https:// en producción', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', INVENTORY_API_URL: 'https://inventario.ejemplo.com' }),
    ).not.toThrow();
  });

  it('acepta http:// fuera de producción', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'development', INVENTORY_API_URL: 'http://localhost:3001' }),
    ).not.toThrow();
  });

  it('rechaza una URL inválida', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'development', INVENTORY_API_URL: 'no-es-url' }),
    ).toThrow(/URL válida/);
  });
});