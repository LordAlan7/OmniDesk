
import {
  buildAITransparency,
  transparencyForAuthorizedAnswer,
} from './ai.transparency';

describe('NFR-003 - Transparencia de recomendaciones IA', () => {
  test('identifica una recomendación respaldada', () => {
    const result = buildAITransparency({
      kind: 'supported',
      verifiedReferenceCount: 2,
    });

    expect(result.status).toBe('supported');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.message).toContain('revisión humana');
  });

  test('rechaza recomendaciones sin referencias verificadas', () => {
    expect(() =>
      buildAITransparency({
        kind: 'supported',
        verifiedReferenceCount: 0,
      }),
    ).toThrow('AI_REFERENCES_REQUIRED');
  });

  test('solicita información adicional concreta', () => {
    const result = buildAITransparency({
      kind: 'needs_more_info',
      missingInformation: [
        ' Modelo del dispositivo ',
        'Mensaje de error',
      ],
    });

    expect(result.status).toBe('needs_more_info');
    expect(result.missingInformation).toEqual([
      'Modelo del dispositivo',
      'Mensaje de error',
    ]);
  });

  test('no permite solicitar aclaraciones vacías', () => {
    expect(() =>
      buildAITransparency({
        kind: 'needs_more_info',
        missingInformation: ['  '],
      }),
    ).toThrow('AI_MISSING_INFORMATION_REQUIRED');
  });

  test('distingue información sin respaldo', () => {
    const result = buildAITransparency({
      kind: 'insufficient_support',
    });

    expect(result.status).toBe('insufficient_support');
    expect(result.requiresHumanReview).toBe(false);
  });

  test('identifica consultas fuera de alcance', () => {
    const result = buildAITransparency({
      kind: 'out_of_scope',
    });

    expect(result.status).toBe('out_of_scope');
    expect(result.message).toContain('soporte');
  });

  test('distingue errores técnicos de diagnósticos', () => {
    const result = buildAITransparency({
      kind: 'technical_error',
    });

    expect(result.status).toBe('technical_error');
    expect(result.message).toContain('No se obtuvo un diagnóstico');
  });

  test('convierte respuestas sin respaldo al estado adecuado', () => {
    const result = transparencyForAuthorizedAnswer({
      status: 'insufficient_information',
      message: 'Información insuficiente',
      references: [],
      aiGenerated: true,
    });

    expect(result.status).toBe('insufficient_support');
  });

  test('convierte respuestas con referencias al estado respaldado', () => {
    const result = transparencyForAuthorizedAnswer({
      status: 'answered',
      answer: 'Revisar la conexión del dispositivo.',
      references: [
        {
          authorizationId: 10,
          sourceType: 'article',
          sourceId: 7,
          sourceVersion: '3',
          title: 'Manual de soporte',
          chunkIndex: 0,
        },
      ],
      aiGenerated: true,

      // AIR-007: Trazabilidad de respuestas de IA
      providedContext: [],
      citations: [],
      generationConfig: {},
    });

    expect(result.status).toBe('supported');
    expect(result.requiresHumanReview).toBe(true);
  });
});
