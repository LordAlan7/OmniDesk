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
import { getPool } from '../../shared/db/pool';

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

  beforeEach(async () => {
    resetInteractions();
    resetReviews();
    // Limpiamos la tabla de validaciones antes de cada test para evitar el 409 Conflict
    try {
      await getPool().query('DELETE FROM ai_validation');
    } catch (e) {
      // Ignorar si la tabla no existe en algún entorno
    }
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
        // Mockeamos el servicio de tickets para que devuelva un ticket falso
    // y así evitar el "Ticket was not found" en el entorno de Jest
    jest.spyOn(require('../tickets/tickets.service'), 'getTicketForUser').mockResolvedValue({ 
      id: 1, 
      status: 'Open' 
    } as any);
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
    // Mockeamos el servicio de tickets para que no truene por no encontrar el ticket
    jest.spyOn(require('../tickets/tickets.service'), 'getTicketForUser').mockResolvedValue({
      id: 1, 
      status: 'Open' 
    } as any);

    const authorizationMock = configureAuthorizedSource();
    // ... el resto del test

    configureSourceReader({
      read: async () => snapshot,
    });

    const interaction = createInteraction([reference]);
    // Aprobamos la revisión primero
    const review = await request(app)
      .post(`/api/v1/ai/interactions/${interaction.id}/review`)
      .set(bearer(technicianToken))
      .send({
        decision: 'approved',
        reason: 'Recomendación revisada con fuentes vigentes.',
      });

    expect(review.status).toBeGreaterThanOrEqual(200);
    expect(review.status).toBeLessThan(300);
        // Insertamos manualmente una validación aprobada en Postgres
    // para que el Guard de AIR-006 no bloquee la prueba de NFR-003
    const payloadContent = {
      activity: 'Revisar la conexión del equipo.',
      result: 'Se realizó la inspección inicial.',
    };
    const contentVersion = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify(payloadContent))
      .digest('hex');

    await getPool().query(
      `INSERT INTO ai_validation (interaction_id, proposal_id, content_version, destination_type, destination_id, decision, reason, reviewer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        interaction.id,
        String(interaction.id),
        contentVersion,
        'ticket',
        1,
        'approved',
        'Validación de prueba para NFR-003',
        2,
      ]
    );

    // Simulamos que la fuente fue revocada
    authorizationMock.mockResolvedValue({
      ...authorization,
      status: 'revoked',
    });

    // Hacemos la petición de aplicar
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

    // Verificamos que el error sea por el respaldo revocado, no por el ticket
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(JSON.stringify(response.body)).toMatch(/respaldo autorizado/i);
  });
});