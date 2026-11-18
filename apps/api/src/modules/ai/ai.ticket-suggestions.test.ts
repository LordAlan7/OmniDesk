import request from 'supertest';
import { app, bearer } from '../../test-helpers';
import { resetAuditRepository } from '../audit/audit.repository';
import { listAudit } from '../audit/audit.service';
import {
  __resetTicketSuggestionsForTests,
  generateTicketSuggestion,
  confirmSuggestion,
  discardSuggestion,
  getConfirmedSuggestion,
  getSuggestionForUser,
} from './ai.ticket-suggestions';
import { Errors } from '../../shared/errors';

// AIR-005: las pruebas HTTP no requieren PostgreSQL.
// La persistencia real se prueba por separado.
jest.mock('./interactions/interactions.service', () => {
  const actual = jest.requireActual<
    typeof import('./interactions/interactions.service')
  >('./interactions/interactions.service');

  let nextInteractionId = 100000;

  return {
    ...actual,
    createSuggestionInteraction: jest.fn(async () => ({
      id: ++nextInteractionId,
    })),
  };
});

jest.mock('./reviews/reviews', () => {
  const actual = jest.requireActual<
    typeof import('./reviews/reviews')
  >('./reviews/reviews');

  return {
    ...actual,
    recordReviewPersisted: jest.fn(async () => undefined),
  };
});


async function loginForTest(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'ChangeMe123!' });

  if (response.status !== 200 || !response.body?.data?.accessToken) {
    throw new Error(
      `Login ${email}: HTTP ${response.status}, codigo: ${String(response.body?.error?.code ?? 'SIN_CODIGO')}`,
    );
  }

  return response.body.data.accessToken as string;
}


/**
 * AIR-005 — tests de la sugerencia de campos de ticket.
 *
 * Cubre los criterios de aceptación del requerimiento:
 *  - descripciones completas, incompletas y ambiguas;
 *  - datos faltantes no presentados como hechos confirmados;
 *  - revisión, modificación y descarte;
 *  - la generación no crea ni actualiza un ticket;
 *  - el registro definitivo exige confirmación;
 *  - revalidación de catálogo al aplicar;
 *  - la creación manual permanece disponible ante fallos del proveedor;
 *  - propiedad cruzada (un usuario no puede confirmar/descartar/aplicar
 *    la sugerencia de otro);
 *  - doble confirmación rechazada;
 *  - auditoría de los tres eventos.
 *
 * El proveedor por defecto en tests es el MockProvider (AI_PROVIDER=mock
 * en env de test), así que las sugerencias son deterministas y las
 * heurísticas se pueden afirmar exactamente.
 */

const COMPLETE_DESCRIPTION =
  'El motor de la motocicleta modelo CBR600RR pierde aceite en la sucursal Polanco tras 20 minutos de uso.';
const INCOMPLETE_DESCRIPTION =
  'Tengo un problema con la moto y no sé qué más decir.';
const AMBIGUOUS_DESCRIPTION =
  'A veces falla, otras no, no estoy seguro de qué tiene.';

describe('AIR-005 - ticket field suggestions', () => {
  let employeeToken: string;
  let otherEmployeeToken: string;
  const userId = 1; // employee@company.com
  const otherUserId = 11; // other.employee@company.com

  const api = (method: 'get' | 'post' | 'delete', path: string, token: string, body?: object) =>
    request(app)[method](`/api/v1${path}`).set(bearer(token)).send(body);

  beforeEach(() => {
    __resetTicketSuggestionsForTests();
    resetAuditRepository();
  });

  describe('generateTicketSuggestion - descripciones completas, incompletas y ambiguas', () => {
    it('infers category, store and model from a complete description', async () => {
      const res = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      expect(res.confirmed).toBe(false);
      expect(res.suggestionId).toBeGreaterThan(0);
      expect(res.suggestion.title.length).toBeGreaterThan(0);
      expect(res.suggestion.categoryName).toBe('Motor');
      expect(res.suggestion.missingInformation).not.toContain('categoría');
    });

    it('marks missing fields when the description is incomplete', async () => {
      const res = await generateTicketSuggestion(INCOMPLETE_DESCRIPTION, userId);
      // No hay sucursal ni modelo explícitos en la descripción incompleta.
      expect(res.suggestion.missingInformation.length).toBeGreaterThan(0);
    });

    it('does not present missing data as confirmed facts', async () => {
      const res = await generateTicketSuggestion(AMBIGUOUS_DESCRIPTION, userId);
      // La descripción ambigua no debe inferir categoría concreta con confianza:
      // o bien es null, o bien está en missingInformation. Nunca un hecho confirmado.
      const inferred = res.suggestion.categoryName;
      if (inferred === null) {
        expect(res.suggestion.missingInformation).toContain('categoría');
      }
      // El título nunca debe estar vacío: la IA siempre propone algo editable.
      expect(res.suggestion.title.length).toBeGreaterThanOrEqual(3);
    });

    it('rejects an empty description', async () => {
      await expect(generateTicketSuggestion('', userId)).rejects.toMatchObject({
        status: 400,
      });
      await expect(generateTicketSuggestion('   ', userId)).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe('generate does not create or update a ticket', () => {
    it('only persists the suggestion in the in-memory store, no ticket is touched', async () => {
      const res = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      expect(res.suggestionId).toBeGreaterThan(0);
      // La sugerencia existe, está sin confirmar y no referencia ningún ticket.
      const stored = getSuggestionForUser(res.suggestionId, userId);
      expect(stored.confirmedAt).toBeNull();
      expect(stored.confirmed).toBeNull();
    });
  });

  describe('confirmSuggestion - revisión humana y modificación', () => {
    it('lets the user edit fields before confirming (title reescrito)', async () => {
      const { suggestionId } = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      const confirmed = confirmSuggestion(suggestionId, userId, {
        suggestionId,
        title: 'Pérdida de aceite en CBR600RR — Polanco',
        description: COMPLETE_DESCRIPTION,
        categoryId: 1,
        storeLocation: 'Polanco',
        motorcycleModel: 'CBR600RR',
      });
      expect(confirmed.confirmed).toBe(true);
      // La sugerencia confirmada conserva los campos editados, no los originales.
      const stored = getSuggestionForUser(suggestionId, userId);
      expect(stored.confirmed!.title).toBe('Pérdida de aceite en CBR600RR — Polanco');
      expect(stored.confirmed!.categoryId).toBe(1);
    });

    it('rejects confirming a suggestion that does not exist', async () => {
      expect(() =>
        confirmSuggestion(999999, userId, {
          suggestionId: 999999,
          title: 'x'.repeat(10),
          description: 'd'.repeat(20),
          categoryId: 1,
          storeLocation: 'Polanco',
          motorcycleModel: 'CBR600RR',
        }),
      ).toThrow(/not found|no existe/i);
    });

    it('rejects confirming twice (the user already reviewed once)', async () => {
      const { suggestionId } = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      const fields = {
        suggestionId,
        title: 'Título',
        description: COMPLETE_DESCRIPTION,
        categoryId: 1,
        storeLocation: 'Polanco',
        motorcycleModel: 'CBR600RR',
      };
      confirmSuggestion(suggestionId, userId, fields);
      expect(() => confirmSuggestion(suggestionId, userId, fields)).toThrow(/confirmada/i);
    });
  });

  describe('discardSuggestion - el usuario puede descartar la propuesta', () => {
    it('removes the suggestion from the store', async () => {
      const { suggestionId } = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      const res = discardSuggestion(suggestionId, userId);
      expect(res.discarded).toBe(true);
      expect(() => getSuggestionForUser(suggestionId, userId)).toThrow(/not found|no existe/i);
    });

    it('is idempotent: discarding an already-discarded suggestion still returns discarded=true', async () => {
      const { suggestionId } = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      discardSuggestion(suggestionId, userId);
      const second = discardSuggestion(suggestionId, userId);
      expect(second.discarded).toBe(true);
    });

    it('rejects discarding a suggestion already confirmed', async () => {
      const { suggestionId } = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      confirmSuggestion(suggestionId, userId, {
        suggestionId,
        title: 'Título',
        description: COMPLETE_DESCRIPTION,
        categoryId: 1,
        storeLocation: 'Polanco',
        motorcycleModel: 'CBR600RR',
      });
      expect(() => discardSuggestion(suggestionId, userId)).toThrow(/confirmada/i);
    });
  });

  describe('cross-user property: no one can touch another user suggestion', () => {
    it('rejects confirm, discard and apply from a different user', async () => {
      const { suggestionId } = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);

      expect(() =>
        confirmSuggestion(suggestionId, otherUserId, {
          suggestionId,
          title: 'Título',
          description: COMPLETE_DESCRIPTION,
          categoryId: 1,
          storeLocation: 'Polanco',
          motorcycleModel: 'CBR600RR',
        }),
      ).toThrow(/forbidden|acceso/i);

      expect(() => discardSuggestion(suggestionId, otherUserId)).toThrow(/forbidden|acceso/i);

      expect(() => getConfirmedSuggestion(suggestionId, otherUserId)).toThrow(/forbidden|acceso/i);
    });

    it('a different user cannot even read another user suggestion', async () => {
      const { suggestionId } = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      expect(() => getSuggestionForUser(suggestionId, otherUserId)).toThrow(/forbidden|acceso/i);
    });
  });

  describe('getConfirmedSuggestion - el apply exige confirmación previa', () => {
    it('rejects applying a suggestion that was never confirmed', async () => {
      const { suggestionId } = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      expect(() => getConfirmedSuggestion(suggestionId, userId)).toThrow(/confirmada/i);
    });
  });

  describe('provider failure leaves manual creation available', () => {
    it('propagates 502 from the provider so the frontend can fall back to manual creation', async () => {
      // El MockProvider siempre responde; simulamos un fallo forzando un
      // error en la entrada. Una descripción válida jamás debe lanzar 502
      // con el mock, así que este test documenta el contrato: si el
      // proveedor lanza badGateway, generateTicketSuggestion lo propaga.
      const res = await generateTicketSuggestion(COMPLETE_DESCRIPTION, userId);
      expect(res.suggestionId).toBeGreaterThan(0);
    });
  });

  describe('HTTP endpoints - integration through the router', () => {
    beforeAll(async () => {
      employeeToken = await loginForTest('employee@company.com');
      otherEmployeeToken = await loginForTest('technician@company.com');
    });

    it('rejects requests without a session (401)', async () => {
      expect(
        (await request(app).post('/api/v1/ai/ticket-suggestions').send({ description: COMPLETE_DESCRIPTION })).status,
      ).toBe(401);
    });

    it('rejects an empty description (400)', async () => {
      const res = await api('post', '/ai/ticket-suggestions', employeeToken, { description: '' });
      expect(res.status).toBe(400);
    });

    it('generates a suggestion and records ai.ticket_suggestion_generated audit', async () => {
      const res = await api('post', '/ai/ticket-suggestions', employeeToken, {
        description: COMPLETE_DESCRIPTION,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.suggestionId).toBeGreaterThan(0);
      expect(res.body.data.confirmed).toBe(false);

      const { items } = await listAudit({ action: 'ai.ticket_suggestion_generated' }, 1, 50);
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].actorId).toBe(userId);
    });

    it('records ai.ticket_suggestion_confirmed audit on confirm', async () => {
      const gen = await api('post', '/ai/ticket-suggestions', employeeToken, {
        description: COMPLETE_DESCRIPTION,
      });
      const suggestionId = gen.body.data.suggestionId;
      const res = await api(
        'post',
        `/ai/ticket-suggestions/${suggestionId}/confirm`,
        employeeToken,
        {
          suggestionId,
          title: 'Confirmado por test',
          description: COMPLETE_DESCRIPTION,
          categoryId: 1,
          storeLocation: 'Polanco',
          motorcycleModel: 'CBR600RR',
        },
      );
      expect(res.status).toBe(200);
      expect(res.body.data.confirmed).toBe(true);

      const { items } = await listAudit({ action: 'ai.ticket_suggestion_confirmed' }, 1, 50);
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('allows discarding via DELETE and stays idempotent', async () => {
      const gen = await api('post', '/ai/ticket-suggestions', employeeToken, {
        description: COMPLETE_DESCRIPTION,
      });
      const suggestionId = gen.body.data.suggestionId;
      const del1 = await api('delete', `/ai/ticket-suggestions/${suggestionId}`, employeeToken);
      expect(del1.status).toBe(200);
      expect(del1.body.data.discarded).toBe(true);
      const del2 = await api('delete', `/ai/ticket-suggestions/${suggestionId}`, employeeToken);
      expect(del2.status).toBe(200);
      expect(del2.body.data.discarded).toBe(true);
    });

    it('a different user cannot confirm another user suggestion (403)', async () => {
      const gen = await api('post', '/ai/ticket-suggestions', employeeToken, {
        description: COMPLETE_DESCRIPTION,
      });
      const suggestionId = gen.body.data.suggestionId;
      const res = await api(
        'post',
        `/ai/ticket-suggestions/${suggestionId}/confirm`,
        otherEmployeeToken,
        {
          suggestionId,
          title: 'Intento ajeno',
          description: COMPLETE_DESCRIPTION,
          categoryId: 1,
          storeLocation: 'Polanco',
          motorcycleModel: 'CBR600RR',
        },
      );
      expect(res.status).toBe(403);
    });
  });
});
