import { Errors } from '../../shared/errors';
import { ticketsRepository } from './tickets.repository';
import type { Ticket } from './tickets.types';

/** Pendiente = cualquier ticket asignado que todavía no esté cerrado. */
export async function hasPendingTicketsForTechnician(
  technicianId: number,
): Promise<boolean> {
  const tickets = await ticketsRepository.list({ visibleTo: null });
  return tickets.some(
    (t: Ticket) =>
      t.assignedTechnicianId === technicianId && t.status !== 'Closed',
  );
}

/**
 * Verifica que un ticket cumpla las reglas condicionales de su estado (NFR-010).
 * Se llama ANTES de persistir cualquier cambio (en save).
 * Lanza 409 (INVALID_STATE) si hay inconsistencia.
 */
export function assertStatusInvariants(ticket: Ticket): void {
  if (ticket.status === 'Resolved' && !ticket.resolution) {
    throw Errors.invalidState(
      'Un ticket en "Resolved" requiere que la resolución esté registrada.',
    );
  }

  if (ticket.status === 'Closed' && !ticket.closedAt) {
    throw Errors.invalidState(
      'Un ticket en "Closed" requiere la fecha de cierre.',
    );
  }

  if (ticket.status === 'Open' && ticket.assignedTechnicianId !== null) {
    throw Errors.invalidState(
      'Un ticket en "Open" no puede tener técnico asignado.',
    );
  }

  if (
    ticket.status !== 'Open' &&
    ticket.assignedTechnicianId === null
  ) {
    throw Errors.invalidState(
      `Un ticket en "${ticket.status}" requiere un técnico asignado.`,
    );
  }
}

/** FR-005: los tickets cerrados no se reclasifican. */
export function canReclassify(ticket: Ticket): void {
  if (ticket.status === 'Closed') {
    throw Errors.invalidState('No se puede cambiar la categoría de un ticket cerrado.');
  }
}
