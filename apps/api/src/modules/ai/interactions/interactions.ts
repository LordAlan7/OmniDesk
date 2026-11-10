import { can, PERMISSIONS } from '../../../shared/authorization';
import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';
import { interactionsRepository } from './interactions.repository';
import type { AiInteraction, InteractionAudit, NewInteraction } from './interactions.types';
import { getSourceReader } from '../sources/source-reader';
import { sourcesRepository } from '../sources/sources.repository';

/**
 * Interacciones con el asistente (AIR-008 / FR-013). Cada una pertenece a UN usuario: no hay ámbito
 * compartido mientras no se apruebe una política (por aprobar). Persistencia: PostgreSQL (memoria en pruebas).
 */
export type { AiInteraction } from './interactions.types';

export type InteractionView =
  | { status: 'available'; interaction: AiInteraction }
  | { status: 'unavailable'; id: number; reason: 'source_withdrawn' | 'source_access_lost'; createdAt: string };

export { resetInteractionsRepository as resetInteractions } from './interactions.repository';

export const recordInteraction = (data: NewInteraction, audit: InteractionAudit) =>
  interactionsRepository.create(data, audit);

/**
 * Devuelve la interacción SOLO a su dueño (404 para cualquier otro, sin distinguir). Al reabrirla se
 * revalida cada referencia con los permisos actuales: si una fuente se retiró o el usuario perdió
 * acceso, el texto generado NO se vuelve a mostrar (no se intenta redactar fragmentos del texto).
 */
export async function getInteractionForUser(id: number, user: AuthUser): Promise<InteractionView> {
  if (!can(user, PERMISSIONS.AI_INTERACTIONS_READ)) throw Errors.forbidden();

  const interaction = await interactionsRepository.findById(id);
  if (!interaction || interaction.userId !== user.id) throw Errors.notFound('Interaction');

  for (const reference of interaction.references) {
    const authorization = await sourcesRepository.findById(reference.authorizationId);
    if (!authorization || authorization.status !== 'approved') {
      return { status: 'unavailable', id, reason: 'source_withdrawn', createdAt: interaction.createdAt };
    }
    const snapshot = await getSourceReader().read(reference.sourceType, reference.sourceId, user);
    if (!snapshot?.visibleToUser) {
      return { status: 'unavailable', id, reason: 'source_access_lost', createdAt: interaction.createdAt };
    }
  }

  return { status: 'available', interaction };
}
