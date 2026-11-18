import { askWithAuthorizedSources } from './ai.service';
import { retrieveAuthorizedContext } from './sources/retrieval';
import type { RetrievedFragment } from './sources/sources.types';
import type { AIAnswer, AIProvider } from './providers/ai-provider';
import type { AuthUser } from '../../shared/types';

jest.mock('./sources/retrieval', () => ({
  retrieveAuthorizedContext: jest.fn(),
}));

const mockedRetrieval = jest.mocked(retrieveAuthorizedContext);

const user: AuthUser = {
  id: 2,
  email: 'technician@company.com',
  name: 'Tecnico',
  roles: ['Technician'],
};

const fragments: RetrievedFragment[] = [
  {
    authorizationId: 10,
    sourceType: 'article',
    sourceId: 7,
    sourceVersion: '3',
    title: 'Manual de soporte',
    chunkIndex: 0,
    content: 'Verificar la conexion.',
  },
  {
    authorizationId: 20,
    sourceType: 'document',
    sourceId: 8,
    sourceVersion: 'archivo-v2',
    title: 'Documento tecnico',
    chunkIndex: 1,
    content: 'Revisar los indicadores.',
  },
];

function provider(answer: AIAnswer): AIProvider {
  return {
    async ask() {
      return answer;
    },
  };
}

function response(
  citations?: AIAnswer['citations']
): AIAnswer {
  return {
    text: 'Respuesta de prueba',
    sources: [],
    ...(citations === undefined ? {} : { citations }),
    aiGenerated: true,
  };
}

beforeEach(() => {
  jest.resetAllMocks();

  mockedRetrieval.mockResolvedValue({
    sufficient: true,
    fragments,
    excluded: [],
  });
});

describe('AIR-003 - Integracion de referencias', () => {
  test('devuelve solamente el fragmento citado', async () => {
    const result = await askWithAuthorizedSources(
      'Como revisar la conexion',
      user,
      provider(response([
        { authorizationId: 10, chunkIndex: 0 },
      ]))
    );

    expect(result.status).toBe('answered');
    expect(result.references).toHaveLength(1);
    expect(result.references[0]?.sourceId).toBe(7);
    expect(result.references[0]?.title).toBe('Manual de soporte');
  });

  test('rechaza citas inventadas por la IA', async () => {
    const result = await askWithAuthorizedSources(
      'Como revisar la conexion',
      user,
      provider(response([
        { authorizationId: 999, chunkIndex: 0 },
      ]))
    );

    expect(result.status).toBe('insufficient_information');
    expect(result.references).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('Respuesta de prueba');
  });

  test('no inventa referencias sin citas', async () => {
    const result = await askWithAuthorizedSources(
      'Como revisar la conexion',
      user,
      provider(response([]))
    );

    expect(result.status).toBe('insufficient_information');
    expect(result.references).toEqual([]);
  });

  test('rechaza respuestas sin campo citations', async () => {
    const result = await askWithAuthorizedSources(
      'Como revisar la conexion',
      user,
      provider(response())
    );

    expect(result.status).toBe('insufficient_information');
    expect(result.references).toEqual([]);
  });

  test('conserva la identidad de dos fuentes diferentes', async () => {
    const result = await askWithAuthorizedSources(
      'Como revisar la conexion',
      user,
      provider(response([
        { authorizationId: 10, chunkIndex: 0 },
        { authorizationId: 20, chunkIndex: 1 },
      ]))
    );

    expect(result.status).toBe('answered');
    expect(result.references).toHaveLength(2);
    expect(result.references.map((r) => r.sourceType))
      .toEqual(['article', 'document']);
    expect(result.references[1]?.sourceVersion)
      .toBe('archivo-v2');
  });
});