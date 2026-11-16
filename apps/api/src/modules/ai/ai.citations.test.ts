import { validateCitedReferences } from './ai.citations';
import type { RetrievedFragment } from './sources/sources.types';

const fragment: RetrievedFragment = {
  authorizationId: 10,
  sourceType: 'article',
  sourceId: 7,
  sourceVersion: '3',
  title: 'Manual de soporte',
  chunkIndex: 0,
  content: 'Verificar la conexion del dispositivo.',
};

describe('AIR-003 - Validacion de citas', () => {
  test('acepta un fragmento autorizado', () => {
    const result = validateCitedReferences(
      [{ authorizationId: 10, chunkIndex: 0 }],
      [fragment]
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Manual de soporte');
    expect(result[0]?.sourceVersion).toBe('3');
  });

  test('rechaza identificadores inventados', () => {
    expect(() =>
      validateCitedReferences(
        [{ authorizationId: 999, chunkIndex: 0 }],
        [fragment]
      )
    ).toThrow('AI_CITATIONS_INVALID');
  });

  test('rechaza fragmentos inexistentes', () => {
    expect(() =>
      validateCitedReferences(
        [{ authorizationId: 10, chunkIndex: 999 }],
        [fragment]
      )
    ).toThrow('AI_CITATIONS_INVALID');
  });

  test('elimina citas duplicadas', () => {
    const result = validateCitedReferences(
      [
        { authorizationId: 10, chunkIndex: 0 },
        { authorizationId: 10, chunkIndex: 0 },
      ],
      [fragment]
    );

    expect(result).toHaveLength(1);
  });

  test('permite cero citas sin inventar referencias', () => {
    expect(
      validateCitedReferences([], [fragment])
    ).toEqual([]);
  });

  test('rechaza identificadores invalidos', () => {
    expect(() =>
      validateCitedReferences(
        [{ authorizationId: -1, chunkIndex: 0 }],
        [fragment]
      )
    ).toThrow('AI_CITATIONS_INVALID');
  });

  test('distingue autorizaciones diferentes', () => {
    const second: RetrievedFragment = {
      ...fragment,
      authorizationId: 11,
      sourceType: 'document',
      sourceVersion: 'archivo-v2',
      title: 'Documento tecnico',
    };

    const result = validateCitedReferences(
      [{ authorizationId: 11, chunkIndex: 0 }],
      [fragment, second]
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceType).toBe('document');
    expect(result[0]?.title).toBe('Documento tecnico');
  });
});