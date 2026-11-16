import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';
import {
  recordInteraction,
  resetInteractions,
} from './interactions/interactions';
import {
  getActiveReviewForInteraction,
  resetReviews,
} from './reviews/reviews';
import {
  configureSourceReader,
  resetSourceReader,
} from './sources/source-reader';
import { sourcesRepository } from './sources/sources.repository';
import type {
  AiSourceAuthorization,
  SourceReference,
} from './sources/sources.types';
import type { KnowledgeSourceSnapshot } from '../knowledge';

describe('NFR-003 - seguridad HTTP de recomendaciones IA', () => {
  let technicianToken: string;

  const userId = 2;

  const reference: SourceReference = {
    authorizationId: 10,
    sourceType: 'article',
    sourceId: 7,
    sourceVersion: '2',
    title: 'Manual de soporte',
    chunkIndex: 0,
  };

  const authorization = {
    id: 10,
    status: 'approved',
    sourceType: 'article',
    sourceId: 7,
    sourceVersion: '2',
    contentHash: 'hash-original',
  } as AiSourceAuthorization;

  const snapshot = {
    type: 'article',
    id: 7,
    title: 'Manual de soporte',
    version: '2',
    contentHash: 'hash-original',
    eligible: true,
    visibleToUser: true,
  } as KnowledgeSourceSnapshot;

  function createInteraction(references: SourceReference[]) {
    return recordInteraction({
      userId,
      question: '¿Cómo solucionar el problema?',
      answer: 'Revisar la conexión del equipo.',
      references,
    });
  }

  function configureAuthorizedSource() {
    return jest
      .spyOn(sourcesRepository, 'findById')
      .mockResolvedValue(authorization);
  }

  beforeAll(async () => {
    technicianToken = await loginAs('technician@company.com');
  });

  beforeEach(() => {
    resetInteractions();
    resetReviews();
  });

  afterEach(() => {
    resetSourceReader();
    jest.restoreAllMocks();
  });

  test('no permite aprobar una respuesta sin referencias', async () => {
    const interaction = createInteraction([]);

    const response = await request(app)
      .post(`/api/v1/ai/interactions/${interaction.id}/review`)
      .set(bearer(technicianToken))
      .send({
        decision: 'approved',
        reason: 'Solicito aprobar esta recomendación.',
      });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    expect(
      getActiveReviewForInteraction(interaction.id),
    ).toBeUndefined();
  });

  test('permite aprobar una respuesta con respaldo vigente', async () => {
    configureAuthorizedSource();

    configureSourceReader({
      read: async () => snapshot,
    });

    const interaction = createInteraction([reference]);

    const response = await request(app)
      .post(`/api/v1/ai/interactions/${interaction.id}/review`)
      .set(bearer(technicianToken))
      .send({
        decision: 'approved',
        reason: 'Referencias comprobadas y revisadas.',
      });

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);

    expect(
      getActiveReviewForInteraction(interaction.id)?.decision,
    ).toBe('approved');
  });

  test('no permite aplicar si la fuente fue revocada', async () => {
    const authorizationMock = configureAuthorizedSource();

    configureSourceReader({
      read: async () => snapshot,
    });

    const interaction = createInteraction([reference]);

    const review = await request(app)
      .post(`/api/v1/ai/interactions/${interaction.id}/review`)
      .set(bearer(technicianToken))
      .send({
        decision: 'approved',
        reason: 'Recomendación revisada con fuentes vigentes.',
      });

    expect(review.status).toBeGreaterThanOrEqual(200);
    expect(review.status).toBeLessThan(300);

    authorizationMock.mockResolvedValue({
      ...authorization,
      status: 'revoked',
    });

    const response = await request(app)
      .post(`/api/v1/ai/interactions/${interaction.id}/apply`)
      .set(bearer(technicianToken))
      .send({
        target: 'investigation',
        ticketId: 1,
        content: {
          activity: 'Revisar la conexión del equipo.',
          result: 'Se realizó la inspección inicial.',
        },
      });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(JSON.stringify(response.body)).toMatch(/respaldo autorizado/i);
  });
});
