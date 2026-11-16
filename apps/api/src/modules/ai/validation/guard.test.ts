import { assertAiValidated } from './guard';
import * as service from './validations.service';
import * as repo from './validations.repository';
import { getTicketForUser } from '../../tickets/tickets.service';

const userTecnico: any = { id: 1, roles: ['Técnico'] };

// Mockeamos la base de datos de validaciones
jest.mock('./validations.repository', () => ({
  findLatestForVersion: jest.fn(),
  insertValidation: jest.fn(),
  markApplied: jest.fn(),
}));

// Mockeamos el servicio de tickets para que no busque en la BD real
jest.mock('../../tickets/tickets.service', () => ({
  getTicketForUser: jest.fn(),
}));

describe('AIR-006 guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Por defecto, asumimos que el ticket existe y el usuario tiene acceso
    (getTicketForUser as jest.Mock).mockResolvedValue({ id: 1 });
  });

  it('rechaza approved:true enviado por el cliente', async () => {
    await expect(assertAiValidated({
      interactionId: 1, proposalId: 'p1', destinationType: 'ticket', destinationId: 1,
      payload: { approved: true, text: 'x' }, user: userTecnico,
    })).rejects.toThrow(/cliente/i);
  });

  it('rechaza sin validación vigente', async () => {
    (repo.findLatestForVersion as jest.Mock).mockResolvedValue(null);

    await expect(assertAiValidated({
      interactionId: 1, proposalId: 'p1', destinationType: 'ticket', destinationId: 1,
      payload: { text: 'x' }, user: userTecnico,
    })).rejects.toThrow(/validación humana/i);
  });

  it('acepta con validación aprobada y mismo contenido', async () => {
    const payload = { text: 'solución' };
    const version = service.hashContent(payload);

    (repo.findLatestForVersion as jest.Mock).mockResolvedValue({
      id: 99,
      decision: 'approved',
      reviewer_id: userTecnico.id,
      content_version: version,
    });

    const r = await assertAiValidated({
      interactionId: 1, proposalId: 'p1', destinationType: 'ticket', destinationId: 1,
      payload, user: userTecnico,
    });
    
    expect(r.validationId).toBe(99);
  });

  it('rechaza si el contenido cambió tras validar', async () => {
    const originalPayload = { text: 'original' };
    const versionOriginal = service.hashContent(originalPayload);

    // 1. Simulamos que la BD tiene una validación para "original"
    (repo.findLatestForVersion as jest.Mock).mockImplementation(
      (interactionId, contentVersion) => {
        if (contentVersion === versionOriginal) {
          return Promise.resolve({
            id: 100,
            decision: 'approved',
            reviewer_id: userTecnico.id,
            content_version: versionOriginal,
          });
        }
        // Si buscan otra versión (la modificada), no hay nada
        return Promise.resolve(null);
      }
    );

    // 2. Intentamos aplicar un texto DIFERENTE
    await expect(assertAiValidated({
      interactionId: 2, proposalId: 'p2', destinationType: 'ticket', destinationId: 2,
      payload: { text: 'modificado' }, user: userTecnico,
    })).rejects.toThrow(/validación humana/i);
  });
});