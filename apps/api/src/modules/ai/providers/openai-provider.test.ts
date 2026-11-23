import { env } from '../../../config/env';
import { OpenAIProvider, parseModelJson } from './openai-provider';

const okResponse = (content: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) }) as Response;

describe('OpenAIProvider - dirección configurable (servicios compatibles como Gemini)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('usa la dirección base indicada y envía la clave solo como cabecera', async () => {
    const fetchMock = jest.fn(async () => okResponse({ answer: 'Respuesta', citations: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new OpenAIProvider('clave-secreta', 'modelo-x', 'https://ejemplo.test/v1beta/openai');

    const answer = await provider.ask('¿Cómo reinicio el equipo?', []);

    expect(answer.text).toBe('Respuesta');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://ejemplo.test/v1beta/openai/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer clave-secreta');
    expect(init.body).not.toContain('clave-secreta');
    expect(JSON.parse(init.body).model).toBe('modelo-x');
  });

  it('sin dirección explícita usa la configurada en el entorno (AI_OPENAI_BASE_URL)', async () => {
    const fetchMock = jest.fn(async () => okResponse({ answer: 'Respuesta', citations: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await new OpenAIProvider('clave', 'modelo').ask('pregunta de prueba', []);

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`${env.aiOpenAiBaseUrl}/chat/completions`);
  });

  it('envía UN solo mensaje de sistema con instrucciones, fuentes y formato (Gemini descarta los demás)', async () => {
    const fetchMock = jest.fn(async () => okResponse({ answer: 'Respuesta', citations: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await new OpenAIProvider('clave', 'modelo', 'https://ejemplo.test/v1').ask('¿Qué reviso antes de viajar?', [
      { articleId: 1, sourceType: 'document', sourceId: 4, sourceVersion: 'v1', chunkIndex: 13, authorizationId: 1, content: 'TEXTO-DEL-MANUAL-XYZ' },
    ]);

    const init = (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1];
    const messages = JSON.parse(init.body).messages as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(messages[0]!.content).toContain('TEXTO-DEL-MANUAL-XYZ');
    expect(messages[0]!.content).toContain('authorizationId=1 chunkIndex=13');
    expect(messages[0]!.content).toContain('"citations"');
    expect(messages[1]!.content).toBe('¿Qué reviso antes de viajar?');
  });

  it('acepta JSON envuelto en un bloque de código (formato habitual de Gemini)', async () => {
    const wrapped = '```json\n{\n  "answer": "Revisa frenos y bocina.",\n  "citations": [{"authorizationId": 1, "chunkIndex": 13}]\n}\n```';
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: wrapped } }] }),
    })) as unknown as typeof fetch;

    const answer = await new OpenAIProvider('clave', 'modelo', 'https://ejemplo.test/v1').ask('¿Qué reviso?', []);

    expect(answer.text).toBe('Revisa frenos y bocina.');
    expect(answer.citations).toEqual([{ authorizationId: 1, chunkIndex: 13 }]);
  });

  it('parseModelJson: JSON puro, con bloque, con texto alrededor; y rechaza lo que no es JSON', () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('Aquí está: {"a":1} listo')).toEqual({ a: 1 });
    expect(() => parseModelJson('sin json')).toThrow();
    expect(() => parseModelJson('{"a":')).toThrow();
  });

  it('registra solo el código HTTP cuando el proveedor falla y no filtra la clave', async () => {
    const logs: unknown[][] = [];
    jest.spyOn(console, 'error').mockImplementation((...args) => void logs.push(args));
    global.fetch = (async () => ({ ok: false, status: 429, json: async () => ({ error: 'cuota agotada' }) })) as unknown as typeof fetch;

    await expect(new OpenAIProvider('clave-secreta', 'modelo').ask('pregunta de prueba', [])).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('saturado'),
    });
    expect(JSON.stringify(logs)).toContain('429');
    expect(JSON.stringify(logs)).not.toContain('clave-secreta');
    expect(JSON.stringify(logs)).not.toContain('cuota agotada');
  });
});
