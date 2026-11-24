
import { assertAiValidated } from './guard';
import { hashContent } from './validations.service';
import * as repo from './validations.repository';

import { getTicketForUser } from '../ai.ports';

import { interactionsService } from '../interactions/interactions.service';
import { assertInteractionCurrentlySupported } from '../interactions/interactions';

// Evitar conexiones reales a PostgreSQL durante estas pruebas.
jest.mock('./validations.repository', () => ({
  findLatestForVersion: jest.fn(),
  insertValidation: jest.fn(),
  markApplied: jest.fn(),
}));

// Simular los tickets sin acceder a la base (paso 8: el guard usa el puerto, no el módulo).
jest.mock('../ai.ports', () => ({
  getTicketForUser: jest.fn(),
}));

// FR-015: simular interacciones persistidas.
jest.mock('../interactions/interactions.service', () => ({
  interactionsService: {
    findById: jest.fn(),
  },
}));

// NFR-003: aislar la lectura de fuentes.
// La implementación real sigue activa fuera de estas pruebas.
jest.mock('../interactions/interactions', () => ({
  assertInteractionCurrentlySupported: jest.fn(),
}));

const userTecnico: any = {
  id: 1,
  roles: ['Technician'],
};

function approvedValidation(
  payload: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 99,
    interaction_id: 1,
    proposal_id: 'p1',
    content_version: hashContent(payload),
    destination_type: 'ticket',
    destination_id: 1,
    decision: 'approved',
    reviewer_id: userTecnico.id,
    applied_at: null,
    ...overrides,
  };
}

describe('AIR-006 + FR-015 - Guard de aplicación', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // Simular una interacción existente y perteneciente al usuario.
    (
      interactionsService.findById as jest.Mock
    ).mockImplementation(async (id: number) => ({
      id,
      userId: userTecnico.id,
      ticketId: id,
      question: 'Consulta de diagnóstico',
      answer: 'Recomendación documentada',
      references: [
        {
          authorizationId: 1,
          sourceType: 'document',
          sourceId: 1,
          sourceVersion: '1',
        },
      ],
      createdAt: new Date().toISOString(),
    }));

    (
      assertInteractionCurrentlySupported as jest.Mock
    ).mockResolvedValue(undefined);

    (
      getTicketForUser as jest.Mock
    ).mockImplementation(async (id: number) => ({
      id,
    }));

    (
      repo.findLatestForVersion as jest.Mock
    ).mockResolvedValue(null);
  });

  it('rechaza approved:true enviado por el cliente', async () => {
    await expect(
      assertAiValidated({
        interactionId: 1,
        proposalId: 'p1',
        destinationType: 'ticket',
        destinationId: 1,
        payload: {
          approved: true,
          text: 'solución',
        },
        user: userTecnico,
      }),
    ).rejects.toThrow(/cliente/i);
  });

  it('rechaza una interacción inexistente', async () => {
    (
      interactionsService.findById as jest.Mock
    ).mockResolvedValue(undefined);

    await expect(
      assertAiValidated({
        interactionId: 1,
        proposalId: 'p1',
        destinationType: 'ticket',
        destinationId: 1,
        payload: { text: 'solución' },
        user: userTecnico,
      }),
    ).rejects.toThrow(/Interaction was not found/i);
  });

  it('rechaza sin validación humana vigente', async () => {
    await expect(
      assertAiValidated({
        interactionId: 1,
        proposalId: 'p1',
        destinationType: 'ticket',
        destinationId: 1,
        payload: { text: 'solución' },
        user: userTecnico,
      }),
    ).rejects.toThrow(/validación humana/i);
  });

  it('acepta una aprobación válida para el mismo contenido', async () => {
    const payload = { text: 'solución' };

    (
      repo.findLatestForVersion as jest.Mock
    ).mockResolvedValue(
      approvedValidation(payload),
    );

    const result = await assertAiValidated({
      interactionId: 1,
      proposalId: 'p1',
      destinationType: 'ticket',
      destinationId: 1,
      payload,
      user: userTecnico,
    });

    expect(result.validationId).toBe(99);
    expect(result.contentVersion).toBe(hashContent(payload));

    expect(
      assertInteractionCurrentlySupported,
    ).toHaveBeenCalledTimes(1);

    expect(getTicketForUser).toHaveBeenCalledWith(
      1,
      userTecnico,
    );
  });

  it('rechaza contenido modificado después de aprobar', async () => {
    const originalPayload = {
      text: 'solución original',
    };

    const originalVersion = hashContent(originalPayload);

    (
      repo.findLatestForVersion as jest.Mock
    ).mockImplementation(
      async (_interactionId, contentVersion) =>
        contentVersion === originalVersion
          ? approvedValidation(originalPayload)
          : null,
    );

    await expect(
      assertAiValidated({
        interactionId: 1,
        proposalId: 'p1',
        destinationType: 'ticket',
        destinationId: 1,
        payload: {
          text: 'solución modificada',
        },
        user: userTecnico,
      }),
    ).rejects.toThrow(/validación humana/i);
  });

  it('rechaza una aprobación de otra propuesta', async () => {
    const payload = { text: 'solución' };

    (
      repo.findLatestForVersion as jest.Mock
    ).mockResolvedValue(
      approvedValidation(payload, {
        proposal_id: 'otra-propuesta',
      }),
    );

    await expect(
      assertAiValidated({
        interactionId: 1,
        proposalId: 'p1',
        destinationType: 'ticket',
        destinationId: 1,
        payload,
        user: userTecnico,
      }),
    ).rejects.toThrow(/otra propuesta/i);
  });

  it('rechaza una aprobación ya aplicada', async () => {
    const payload = { text: 'solución' };

    (
      repo.findLatestForVersion as jest.Mock
    ).mockResolvedValue(
      approvedValidation(payload, {
        applied_at: new Date(),
      }),
    );

    await expect(
      assertAiValidated({
        interactionId: 1,
        proposalId: 'p1',
        destinationType: 'ticket',
        destinationId: 1,
        payload,
        user: userTecnico,
      }),
    ).rejects.toThrow(/ya fue utilizada/i);
  });

  it('rechaza cuando se pierde el respaldo autorizado', async () => {
    (
      assertInteractionCurrentlySupported as jest.Mock
    ).mockRejectedValue(
      new Error('El respaldo autorizado ya no está disponible'),
    );

    await expect(
      assertAiValidated({
        interactionId: 1,
        proposalId: 'p1',
        destinationType: 'ticket',
        destinationId: 1,
        payload: { text: 'solución' },
        user: userTecnico,
      }),
    ).rejects.toThrow(/respaldo autorizado/i);
  });
});
