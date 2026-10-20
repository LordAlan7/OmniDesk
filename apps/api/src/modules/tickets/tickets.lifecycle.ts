import { env } from '../../config/env';
import { ticketsRepository } from './tickets.repository';
import {
  postgresTicketsRepository,
} from './tickets.postgres.repository';

/**
 * Pendiente: cualquier ticket asignado que no esté cerrado.
 * Incluye Resolved porque todavía puede reabrirse.
 */
export async function hasPendingTicketsForTechnician(
  technicianId: number,
): Promise<boolean> {
  if (env.nodeEnv !== 'test') {
    return postgresTicketsRepository.hasPendingTickets(
      technicianId,
    );
  }

  return ticketsRepository
    .list({ visibleTo: null })
    .some(
      (ticket) =>
        ticket.assignedTechnicianId === technicianId &&
        ticket.status !== 'Closed',
    );
}