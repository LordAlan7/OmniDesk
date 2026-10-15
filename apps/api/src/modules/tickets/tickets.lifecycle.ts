import { ticketsRepository } from './tickets.repository';

// Pendiente = cualquier ticket asignado que todavía no esté cerrado.
// Incluye Resolved, porque aún puede reabrirse.
export function hasPendingTicketsForTechnician(
  technicianId: number,
): boolean {
  return ticketsRepository
    .list({ visibleTo: null })
    .some(
      (ticket) =>
        ticket.assignedTechnicianId === technicianId &&
        ticket.status !== 'Closed',
    );
}