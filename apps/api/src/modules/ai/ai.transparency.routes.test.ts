
import request from 'supertest';

import {
  app,
  bearer,
  loginAs,
} from '../../test-helpers';

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

import type {
  KnowledgeSourceSnapshot,
} from '../knowledge';

/**
 * NFR-003 + AIR-006 + FR-015
 *
 * Estas pruebas verifican el comportamiento HTTP
 * y la autorización de las recomendaciones.
 *
 * NODE_ENV=test utiliza interacciones y revisiones
 * en memoria.
 *
 * La persistencia SQL de AIR-006 se simula para
 * evitar referencias a interacciones que no existen
 * en la base de datos de PostgreSQL.
 */
jest.mock('./reviews/reviews', () => {
  const actual = jest.requireActual('./reviews/reviews');

  return {
    ...actual,

    recordReviewPersisted: jest.fn(
      async () => undefined,
    ),
  };
});

describe(
  'NFR-003 - seguridad HTTP de recomendaciones IA',
  () => {
    let technicianToken: string;

    const userId = 2;
    const ticketId = 1;

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

    const payloadContent = {
      activity: 'Revisar la conexión del equipo.',
      result: 'Se realizó la inspección inicial.',
    };

    /**
     * Crea una interacción simulada asociada
     * al ticket utilizado por estas pruebas.
     *
     * FR-015 exige la asociación al ticket
     * antes de aprobar una recomendación.
     */
    function createInteraction(
      references: SourceReference[],
    ) {
      return recordInteraction({
        userId,
        question: '¿Cómo solucionar el problema?',
        answer: 'Revisar la conexión del equipo.',
        references,
        ticketId,
      });
    }

    /**
     * Configura una autorización aprobada.
     * Devuelve el mock para permitir revocarlo
     * durante una prueba.
     */
    function configureAuthorizedSource() {
      return jest
        .spyOn(sourcesRepository, 'findById')
        .mockResolvedValue(authorization);
    }

    /**
     * La autorización de acceso al ticket
     * se comprueba con un objeto simulado.
     *
     * No se consulta la base de datos real.
     */
    function mockTicketAccess() {
      return jest
        .spyOn(
          require('../tickets/tickets.service'),
          'getTicketForUser',
        )
        .mockResolvedValue({
          id: ticketId,
          status: 'In Progress',
          version: 1,
          createdBy: userId,
          assignedTechnicianId: userId,
        } as any);
    }

    beforeAll(async () => {
      technicianToken = await loginAs(
        'technician@company.com',
      );
    });

    beforeEach(() => {
      resetInteractions();
      resetReviews();

      mockTicketAccess();
    });

    afterEach(() => {
      resetSourceReader();

      jest.restoreAllMocks();
    });

    /**
     * CASO 1
     *
     * Una recomendación sin fuentes autorizadas
     * no puede aprobarse.
     */
    test(
      'no permite aprobar una respuesta sin referencias',
      async () => {
        const interaction = createInteraction([]);

        const response = await request(app)
          .post(
            `/api/v1/ai/interactions/${interaction.id}/review`,
          )
          .set(bearer(technicianToken))
          .send({
            decision: 'approved',
            reason:
              'Solicito aprobar esta recomendación.',
            target: 'investigation',
            content: payloadContent,
          });

        expect(response.status)
          .toBeGreaterThanOrEqual(400);

        expect(response.status)
          .toBeLessThan(500);

        expect(
          getActiveReviewForInteraction(
            interaction.id,
          ),
        ).toBeUndefined();
      },
    );

    /**
     * CASO 2
     *
     * Una recomendación con referencias
     * autorizadas y vigentes puede aprobarse.
     */
    test(
      'permite aprobar una respuesta con respaldo vigente',
      async () => {
        configureAuthorizedSource();

        configureSourceReader({
          read: async () => snapshot,
        });

        const interaction = createInteraction([
          reference,
        ]);

        const response = await request(app)
          .post(
            `/api/v1/ai/interactions/${interaction.id}/review`,
          )
          .set(bearer(technicianToken))
          .send({
            decision: 'approved',
            reason:
              'Referencias comprobadas y revisadas.',
            target: 'investigation',
            content: payloadContent,
          });

        expect(response.status)
          .toBeGreaterThanOrEqual(200);

        expect(response.status)
          .toBeLessThan(300);

        expect(
          getActiveReviewForInteraction(
            interaction.id,
          )?.decision,
        ).toBe('approved');
      },
    );

    /**
     * CASO 3
     *
     * Una recomendación previamente aprobada
     * no puede aplicarse después de que su
     * fuente autorizada sea revocada.
     */
    test(
      'no permite aplicar si la fuente fue revocada',
      async () => {
        const authorizationMock =
          configureAuthorizedSource();

        configureSourceReader({
          read: async () => snapshot,
        });

        const interaction = createInteraction([
          reference,
        ]);

        // Aprobar mientras la fuente es válida.
        const review = await request(app)
          .post(
            `/api/v1/ai/interactions/${interaction.id}/review`,
          )
          .set(bearer(technicianToken))
          .send({
            decision: 'approved',
            reason:
              'Recomendación revisada con fuentes vigentes.',
            target: 'investigation',
            content: payloadContent,
          });

        expect(review.status)
          .toBeGreaterThanOrEqual(200);

        expect(review.status)
          .toBeLessThan(300);

        expect(
          getActiveReviewForInteraction(
            interaction.id,
          )?.decision,
        ).toBe('approved');

        // Revocar la fuente después de aprobar.
        authorizationMock.mockResolvedValue({
          ...authorization,
          status: 'revoked',
        } as AiSourceAuthorization);

        // Intentar aplicar la recomendación.
        const response = await request(app)
          .post(
            `/api/v1/ai/interactions/${interaction.id}/apply`,
          )
          .set(bearer(technicianToken))
          .send({
            target: 'investigation',
            ticketId,
            content: payloadContent,
          });

        // Debe rechazarse.
        expect(response.status)
          .toBeGreaterThanOrEqual(400);

        expect(response.status)
          .toBeLessThan(500);

        // Debe rechazarse por perder el respaldo,
        // no porque el ticket sea inexistente.
        expect(
          JSON.stringify(response.body),
        ).toMatch(/respaldo autorizado/i);
      },
    );
  },
);
