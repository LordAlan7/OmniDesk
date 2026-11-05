import { can, PERMISSIONS } from '../../../shared/authorization';
import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';
import { getSourceReader } from '../sources/source-reader';
import { sourcesRepository } from '../sources/sources.repository';
import type { SourceReference } from '../sources/sources.types';

/**
 * Interacciones con el asistente (AIR-008). Cada una pertenece a UN usuario: no hay ámbito compartido
 * mientras no se apruebe una política (por aprobar). FR-013 las creará; aquí solo se define el acceso.
 * Almacén en memoria: la persistencia en PostgreSQL llega con FR-013/AIR-007.
 */
export interface AiInteraction {
  id: number;
  userId: number;
  question: string;
  answer: string;
  references: SourceReference[];
  createdAt: string;
}

export type InteractionView =
  | { status: 'available'; interaction: AiInteraction }
  | { status: 'unavailable'; id: number; reason: 'source_withdrawn' | 'source_access_lost'; createdAt: string };

const store = new Map<number, AiInteraction>();
let nextId = 1;

export function recordInteraction(input: Omit<AiInteraction, 'id' | 'createdAt'>): AiInteraction {
  const interaction: AiInteraction = { ...input, id: nextId++, createdAt: new Date().toISOString() };
  store.set(interaction.id, interaction);
  return interaction;
}

export function resetInteractions(): void {
  store.clear();
  nextId = 1;
}

/**
 * Devuelve la interacción SOLO a su dueño (404 para cualquier otro, sin distinguir). Al reabrirla se
 * revalida cada referencia con los permisos actuales: si una fuente se retiró o el usuario perdió
 * acceso, el texto generado NO se vuelve a mostrar (no se intenta redactar fragmentos del texto).
 */
export async function getInteractionForUser(id: number, user: AuthUser): Promise<InteractionView> {
  if (!can(user, PERMISSIONS.AI_INTERACTIONS_READ)) throw Errors.forbidden();

  const interaction = store.get(id);
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
