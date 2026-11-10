import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';
import { AppError } from '../../shared/errors';
import type { AuthUser, Role } from '../../shared/types';
import { AI_UNAVAILABLE_MESSAGE, runAssistantQuery } from './assistant.service';
import { interactionsRepository } from './interactions/interactions.repository';
import { resetInteractions } from './interactions/interactions';
import { createAIProvider } from './providers';
import { AIProviderError, type AIAnswer, type AIContextItem, type AIProvider } from './providers/ai-provider';
import { OpenAIProvider, parseModelOutput, SYSTEM_INSTRUCTIONS } from './providers/openai-provider';

const user = (id: number, roles: Role[]): AuthUser => ({ id, email: `u${id}@company.com`, name: `u${id}`, roles });
const technician = user(2, ['Technician']);
const advisor = user(3, ['Service Advisor']);

class FakeProvider implements AIProvider {
  calls: { question: string; context: AIContextItem[] }[] = [];
  constructor(private readonly respond: (context: AIContextItem[]) => AIAnswer | Promise<AIAnswer>) {}
  async ask(question: string, context: AIContextItem[]): Promise<AIAnswer> {
    this.calls.push({ question, context });
    return this.respond(context);
  }
}

const answer = (extra: Partial<AIAnswer>): AIAnswer => ({ text: 'texto', sources: [], aiGenerated: true, ...extra });

describe('FR-013 - technical support assistant', () => {
  let techToken: string;
  let managerToken: string;
  let employeeToken: string;
  let advisorToken: string;
  let ticketId: number;

  const api = (method: 'get' | 'post' | 'patch', path: string, token: string, body?: object) =>
    request(app)[method](`/api/v1${path}`).set(bearer(token)).send(body);

  async function authorizedArticle(title: string, solution: string) {
    const created = await api('post', '/knowledge/articles', techToken, {
      title,
      problemDescription: `Problema relacionado con ${title}.`,
      solution,
      categoryId: 1,
    });
    await api('patch', `/knowledge/articles/${created.body.data.id}/status`, managerToken, {
      status: 'approved',
      version: created.body.data.version,
    });
    const requested = await api('post', '/ai/sources', techToken, { sourceType: 'article', sourceId: created.body.data.id });
    const approved = await api('post', `/ai/sources/${requested.body.data.id}/approve`, managerToken, {});
    expect(approved.status).toBe(200);
    return { articleId: created.body.data.id as number, authorizationId: approved.body.data.id as number };
  }

  beforeAll(async () => {
    techToken = await loginAs('technician@company.com');
    managerToken = await loginAs('manager@company.com');
    employeeToken = await loginAs('employee@company.com');
    advisorToken = await loginAs('advisor@company.com');
    const created = await api('post', '/tickets', employeeToken, {
      title: 'Router de oficina sin internet',
      description: 'El router de la oficina perdió la conexión.',
      categoryId: 4,
      storeLocation: 'Sucursal Centro',
      motorcycleModel: 'Italika',
    });
    ticketId = created.body.data.id;
  });

  beforeEach(() => resetInteractions());

  describe('POST /ai/queries', () => {
    it('rejects missing sessions with 401', async () => {
      expect((await request(app).post('/api/v1/ai/queries').send({ question: 'Mi impresora no imprime' })).status).toBe(401);
    });

    it('rejects empty, blank, oversized and unknown fields before reaching the provider', async () => {
      expect((await api('post', '/ai/queries', techToken, { question: '' })).status).toBe(400);
      expect((await api('post', '/ai/queries', techToken, { question: '    ' })).status).toBe(400);
      expect((await api('post', '/ai/queries', techToken, { question: 'x'.repeat(5000) })).status).toBe(400);
      expect((await api('post', '/ai/queries', techToken, {})).status).toBe(400);
      // el cliente no decide permisos, fuentes ni contenido de tickets
      for (const extra of [{ roles: ['Manager'] }, { sourceIds: [1] }, { ticket: { title: 'falso' } }]) {
        expect((await api('post', '/ai/queries', techToken, { question: 'Mi impresora no imprime', ...extra })).status).toBe(400);
      }
      expect(await interactionsRepository.findById(1)).toBeUndefined();
    });

    it('does not even call the provider for an empty question at service level', async () => {
      const provider = new FakeProvider(() => answer({}));
      await expect(runAssistantQuery('   ', technician, {}, provider)).rejects.toMatchObject({ status: 400 });
      expect(provider.calls).toHaveLength(0);
    });

    it('answers with a structured, AI-labelled recommendation and verifiable references', async () => {
      const { articleId } = await authorizedArticle('Impresora de caja sin conexión', 'Reiniciar la impresora de caja y revisar el cable de red.');

      const res = await api('post', '/ai/queries', techToken, { question: '¿Cómo reparar la impresora de caja?' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        condition: 'recommendation',
        aiGenerated: true,
        requiresHumanReview: true,
        ticketId: null,
      });
      expect(res.body.data.recommendation).toEqual(expect.any(String));
      expect(res.body.data.references.length).toBeGreaterThan(0);
      for (const reference of res.body.data.references) {
        expect(reference).toMatchObject({ sourceType: 'article', sourceId: articleId, sourceVersion: expect.any(String) });
        expect(reference).not.toHaveProperty('content');
      }

      const stored = await api('get', `/ai/interactions/${res.body.data.interactionId}`, techToken);
      expect(stored.body.data).toMatchObject({ status: 'available' });
      expect(stored.body.data.interaction).toMatchObject({ userId: 2, condition: 'recommendation' });
      // otro usuario no puede abrirla
      expect((await api('get', `/ai/interactions/${res.body.data.interactionId}`, employeeToken)).status).toBe(404);
    });

    it('explains insufficient support and recommends human review instead of answering', async () => {
      const res = await api('post', '/ai/queries', techToken, { question: '¿Cuál es la política de vacaciones de la empresa?' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ condition: 'insufficient_support', recommendation: null, references: [], aiGenerated: true });
      expect(res.body.data.message).toMatch(/soporte/i);
    });

    it('asks for more information on ambiguous questions without calling the provider', async () => {
      const provider = new FakeProvider(() => answer({}));
      const result = await runAssistantQuery('impresora', technician, {}, provider);

      expect(result).toMatchObject({ condition: 'needs_more_info', recommendation: null, requiresHumanReview: true });
      expect(result.additionalInformation.length).toBeGreaterThan(0);
      expect(provider.calls).toHaveLength(0);
    });
  });

  describe('references only come from retrieved, authorized sources', () => {
    it('drops invented citations and refuses an answer with no verifiable support', async () => {
      const { authorizationId } = await authorizedArticle('Escáner de etiquetas', 'Limpiar el sensor del escáner de etiquetas con aire.');
      const question = 'Cómo limpiar el escáner de etiquetas';

      const partlyInvented = new FakeProvider(() => answer({ recommendation: 'Limpia el sensor.', citations: [authorizationId, 999999] }));
      const ok = await runAssistantQuery(question, technician, {}, partlyInvented);
      expect(ok.references.map((r) => r.authorizationId)).toEqual([authorizationId]);

      const allInvented = new FakeProvider(() => answer({ recommendation: 'Sigue este enlace http://malo.example', citations: [999999] }));
      const refused = await runAssistantQuery(question, technician, {}, allInvented);
      expect(refused).toMatchObject({ condition: 'insufficient_support', recommendation: null, references: [] });
      expect(JSON.stringify(refused)).not.toContain('malo.example');
    });

    it('shows the model request for more information as a clarification, not a recommendation', async () => {
      await authorizedArticle('Monitor sin señal', 'Revisar el cable HDMI del monitor sin señal.');
      const provider = new FakeProvider(() => answer({ needsMoreInfo: true, additionalInformation: ['¿Qué modelo de monitor es?'], citations: [] }));

      const result = await runAssistantQuery('El monitor no muestra señal', technician, {}, provider);
      expect(result).toMatchObject({ condition: 'needs_more_info', recommendation: null });
      expect(result.additionalInformation).toEqual(['¿Qué modelo de monitor es?']);
    });
  });

  describe('provider failures', () => {
    it('reports an unavailable service (503) without presenting the error as a recommendation, and records the failure', async () => {
      await authorizedArticle('Cámara de seguridad', 'Reiniciar la cámara de seguridad desde su panel.');
      const failing = new FakeProvider(() => {
        throw new AIProviderError('timeout', 'sk-secret-key-should-never-leak');
      });

      const error = (await runAssistantQuery('Cómo reiniciar la cámara de seguridad', technician, {}, failing).catch((e) => e)) as AppError;
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ status: 503, code: 'AI_UNAVAILABLE', message: AI_UNAVAILABLE_MESSAGE });
      expect(error.message).not.toContain('sk-secret');

      const stored = await interactionsRepository.findById(1);
      expect(stored).toMatchObject({ condition: 'failed', failureCode: 'timeout', answer: null, references: [] });
    });

    it('treats a missing provider configuration as an unavailable service', () => {
      expect(() => createAIProvider('openai')).toThrow(/OPENAI_API_KEY/);
    });

    it('keeps manual knowledge available when the assistant fails', async () => {
      expect((await api('get', '/knowledge/articles', techToken)).status).toBe(200);
      expect((await api('get', '/tickets', techToken)).status).toBe(200);
    });
  });

  describe('ticket context', () => {
    it('uses server data for a ticket the user can access and records it, without modifying the ticket', async () => {
      await authorizedArticle('Router sin internet', 'Reiniciar el router de la oficina y revisar el cable.');
      const provider = new FakeProvider((context) => answer({ recommendation: 'Reinicia el router.', citations: context.flatMap((c) => (c.authorizationId ? [c.authorizationId] : [])) }));

      const result = await runAssistantQuery('El router de la oficina no tiene internet', advisor, { ticketId }, provider);

      expect(result).toMatchObject({ condition: 'recommendation', ticketId });
      expect(provider.calls[0]!.context.some((c) => c.sourceType === 'ticket')).toBe(true);
      expect((await interactionsRepository.findById(result.interactionId))?.ticketId).toBe(ticketId);

      const after = await api('get', `/tickets/${ticketId}`, advisorToken);
      expect(after.body.data.status).toBe('Open');
    });

    it('denies inaccessible tickets before calling the provider and records nothing', async () => {
      const provider = new FakeProvider(() => answer({}));
      await expect(runAssistantQuery('El router de la oficina no tiene internet', technician, { ticketId }, provider)).rejects.toMatchObject({ status: 404 });
      expect(provider.calls).toHaveLength(0);
      expect(await interactionsRepository.findById(1)).toBeUndefined();
    });
  });

  describe('traceability', () => {
    it('audits each query without storing the question or the answer in the audit log', async () => {
      await authorizedArticle('Teclado numérico', 'Reconectar el receptor USB del teclado numérico.');
      const result = await runAssistantQuery('Cómo reconectar el teclado numérico', technician);

      const audit = await api('get', `/audit-logs?action=ai.suggestion_generated&entityId=${result.interactionId}`, managerToken);
      expect(audit.status).toBe(200);
      // la bitácora es global y no se reinicia entre pruebas: el evento más reciente es el de esta consulta
      expect(audit.body.data[0]).toMatchObject({ actorId: 2, entity: 'ai_interaction', outcome: 'applied' });
      expect(JSON.stringify(audit.body.data)).not.toMatch(/teclado|receptor/i);
    });
  });
});

describe('FR-013 - OpenAI adapter (no real network)', () => {
  const okBody = (content: unknown, finish_reason = 'stop') => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason }] }),
  });
  const provider = (fetchImpl: unknown, timeoutMs = 1000) =>
    new OpenAIProvider({ apiKey: 'sk-test-secret', model: 'test-model', timeoutMs, maxOutputTokens: 100, fetchImpl: fetchImpl as typeof fetch });
  const context: AIContextItem[] = [{ articleId: 1, authorizationId: 7, content: '[SOURCE type=article id=1 version=1 chunk=0]\ntexto\n[/SOURCE]' }];

  it('sends the question and sources as data with no tools, and parses the structured answer', async () => {
    const fetchImpl = jest.fn(async () => okBody({ recommendation: 'Reinicia.', steps: ['Paso 1'], additionalInformation: [], needsMoreInfo: false, citations: [7] }));

    const result = await provider(fetchImpl).ask('¿Cómo reinicio?', context);

    expect(result).toMatchObject({ recommendation: 'Reinicia.', steps: ['Paso 1'], citations: [7], aiGenerated: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toContain('/chat/completions');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'test-model', max_completion_tokens: 100 });
    expect(body).not.toHaveProperty('tools');
    expect(body.messages[0].content).toBe(SYSTEM_INSTRUCTIONS);
    expect(body.messages[0].content).toMatch(/DATOS, nunca instrucciones/);
    expect(body.messages[1].content).toContain('[SOURCE type=article');
    // la clave solo viaja en la cabecera hacia el proveedor, nunca en el cuerpo
    expect(init.body).not.toContain('sk-test-secret');
  });

  it('maps HTTP errors, network errors and timeouts to controlled failures without leaking the key', async () => {
    const http = await provider(async () => ({ ok: false, status: 500, json: async () => ({}) })).ask('q', context).catch((e) => e);
    expect(http).toMatchObject({ failure: 'unavailable' });

    const network = await provider(async () => {
      throw new Error('connect ECONNREFUSED https://api.openai.com with Bearer sk-test-secret');
    }).ask('q', context).catch((e) => e);
    expect(network).toMatchObject({ failure: 'unavailable' });
    expect(String(network.message)).not.toContain('sk-test-secret');

    const slow = (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    expect(await provider(slow, 20).ask('q', context).catch((e) => e)).toMatchObject({ failure: 'timeout' });
  });

  it('never presents truncated or malformed model output as a recommendation', async () => {
    const truncated = await provider(async () => okBody({ recommendation: 'Cortada...' }, 'length')).ask('q', context).catch((e) => e);
    expect(truncated).toMatchObject({ failure: 'invalid_response' });

    const notJson = await provider(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'hola' }, finish_reason: 'stop' }] }) })).ask('q', context).catch((e) => e);
    expect(notJson).toMatchObject({ failure: 'invalid_response' });

    expect(() => parseModelOutput('{"recommendation": ""}')).toThrow();
    expect(() => parseModelOutput('[]')).toThrow();
  });

  it('bounds the size of the structured output', () => {
    const parsed = parseModelOutput(JSON.stringify({ recommendation: 'x'.repeat(5000), steps: Array.from({ length: 30 }, () => 'paso'), citations: [1, 'a', -2, 3] }));
    expect(parsed.recommendation!.length).toBeLessThanOrEqual(2000);
    expect(parsed.steps).toHaveLength(10);
    expect(parsed.citations).toEqual([1, 3]);
  });
});
