import { askWithAuthorizedSources } from './ai.service';
import { transparencyForAuthorizedAnswer } from './ai.transparency';
import { screenSupportQuestion } from './ai.question-classifier';
import type { AIProvider } from './providers/ai-provider';
import type { AuthUser } from '../../shared/types';

describe('NFR-003 - clasificación de consultas', () => {
  const user: AuthUser = {
    id: 2,
    email: 'tecnico@test.com',
    name: 'Tecnico',
    roles: ['Technician'],
  };

  const provider: AIProvider = {
    ask: async () => {
      throw new Error('No debe llamarse al proveedor.');
    },
  };

  test('solicita detalles para una pregunta ambigua', async () => {
    const answer = await askWithAuthorizedSources('No funciona', user, provider);

    expect(answer.status).toBe('needs_more_info');
    expect(answer.references).toEqual([]);

    const transparency = transparencyForAuthorizedAnswer(answer);

    expect(transparency.status).toBe('needs_more_info');
    expect(transparency.missingInformation.length).toBeGreaterThan(0);
  });

  test('reconoce una consulta claramente fuera de alcance', async () => {
    const answer = await askWithAuthorizedSources(
      '¿Qué clima hará mañana?',
      user,
      provider,
    );

    expect(answer.status).toBe('out_of_scope');
    expect(answer.references).toEqual([]);
    expect(transparencyForAuthorizedAnswer(answer).status).toBe('out_of_scope');
  });

  test('permite continuar con consultas específicas de soporte', () => {
    expect(
      screenSupportQuestion('¿Cómo reparar una impresora sin conexión?', false).kind,
    ).toBe('continue');
  });

  test('no exige aclaraciones por una pregunta breve si existe ticket', () => {
    expect(
      screenSupportQuestion('No funciona', true).kind,
    ).toBe('continue');
  });
});
