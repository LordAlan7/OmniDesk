import { findInteractionInPostgres } from './interactions.postgres.repository';
import { createInteractionInPostgres } from './interactions.postgres.repository';
import { interactionsRepository } from './interactions.repository';

export const interactionsService = {
  create: interactionsRepository.create,
  findById: interactionsRepository.findById,
  listByUser: interactionsRepository.listByUser,
};


/**
 * AIR-005 / AIR-007:
 * Persiste una interacción vinculada a una sugerencia de ticket.
 * Mantiene el acceso a PostgreSQL fuera de las rutas HTTP.
 */
export async function createSuggestionInteraction(
  input: Parameters<typeof createInteractionInPostgres>[0],
) {
  return createInteractionInPostgres(input);
}
/** AIR-005: persisted interaction lookup for creation-only approval checks. */
export const findSuggestionInteractionPersisted = findInteractionInPostgres;
