import { can, PERMISSIONS } from '../../../shared/authorization';
import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';
import { getSourceReader } from '../sources/source-reader';
import { sourcesRepository } from '../sources/sources.repository';
import type { SourceReference } from '../sources/sources.types';

/**
 * Interacciones con el asistente (AIR-008). Cada una pertenece a UN usuario: no hay ámbito compartido
 * mientras no se apruebe una política (por aprobar). FR-013 las creará; aquí solo se define el acceso.
 * 
 * AIR-007: Persistencia en PostgreSQL de la trazabilidad (contexto suministrado, citas y configuración).
 */
export interface AiInteraction {
  id: number;
  userId: number;
  question: string;
  answer: string;
  references: SourceReference[];
  /** AIR-004: ticket al que se asoció la consulta, si lo hubo. Lo usa /review y /apply. */
  ticketId?: number | null;
  createdAt: string;
  /** AIR-007: Fragmentos exactos enviados al modelo. */
  providedContext?: any[];
  /** AIR-007: Citas que el modelo declaró usar. */
  citations?: any[];
  /** AIR-007: Configuración del modelo (ej. versión, temperatura). */
  generationConfig?: Record<string, unknown>;
}

export interface RecordInteractionInput extends Omit<AiInteraction, 'id' | 'createdAt'> {
  providedContext?: any[];
  citations?: any[];
  generationConfig?: Record<string, unknown>;
}

export type InteractionView =
  | { status: 'available'; interaction: AiInteraction }
  | { status: 'unavailable'; id: number; reason: 'source_withdrawn' | 'source_access_lost'; createdAt: string };

const store = new Map<number, AiInteraction>();
let nextId = 1;

/**
 * AIR-007: Guarda la interacción en memoria y en PostgreSQL (asíncronamente).
 */
export function recordInteraction(input: RecordInteractionInput): AiInteraction {
  const interaction: AiInteraction = { ...input, id: nextId++, createdAt: new Date().toISOString() };
  store.set(interaction.id, interaction);

  // AIR-007: Solo guardamos en Postgres si NO estamos en Jest (evita romper tests de otros)
  // AIR-007: Solo guardamos en Postgres si NO estamos en Jest
  // Usamos 'typeof jest === undefined' porque Jest inyecta la variable 'jest' globalmente
  if (typeof jest === 'undefined') {
    const { saveInteractionToDb } = require('./interactions.repository');
    
    saveInteractionToDb(input, interaction.createdAt)
      .then((dbId: any) => {
        interaction.id = dbId;
      })
      .catch((error: any) => {
        console.error('Error al persistir interacción (AIR-007) en Postgres:', error);
      });
  }

  return interaction;
}

export function resetInteractions(): void {
  store.clear();
  nextId = 1;
}

/** AIR-004: acceso a una interacción por id (sin revalidar referencias). Lo usa /review y /apply. */
export function getInteractionById(id: number): AiInteraction | undefined {
  return store.get(id);
}

/**
 * Devuelve la interacción SOLO a su dueño (404 para cualquier otro, sin distinguir). Al reabrirla se
 * revalida cada referencia con los permisos actuales: si una fuente se retiró o el usuario perdió
 * acceso, el texto generado NO se vuelve a mostrar.
 */
export async function getInteractionForUser(id: number, user: AuthUser): Promise<InteractionView> {
  if (!can(user, PERMISSIONS.AI_INTERACTIONS_READ)) throw Errors.forbidden();

  const interaction = store.get(id);
  if (!interaction || interaction.userId !== user.id) throw Errors.notFound('Interaction');

  for (const reference of interaction.references) {
    const authorization = await sourcesRepository.findById(reference.authorizationId);
    if (
      !authorization ||
      authorization.status !== 'approved' ||
      authorization.sourceType !== reference.sourceType ||
      authorization.sourceId !== reference.sourceId ||
      authorization.sourceVersion !== reference.sourceVersion
    ) {
      return { status: 'unavailable', id, reason: 'source_withdrawn', createdAt: interaction.createdAt };
    }
    const snapshot = await getSourceReader().read(reference.sourceType, reference.sourceId, user);
    if (!snapshot?.visibleToUser) {
      return { status: 'unavailable', id, reason: 'source_access_lost', createdAt: interaction.createdAt };
    }

    if (
      !snapshot.eligible ||
      snapshot.type !== reference.sourceType ||
      snapshot.id !== reference.sourceId ||
      snapshot.version !== authorization.sourceVersion ||
      snapshot.contentHash !== authorization.contentHash
    ) {
      return {
        status: 'unavailable',
        id,
        reason: 'source_withdrawn',
        createdAt: interaction.createdAt,
      };
    }
  }

  return { status: 'available', interaction };
}

/**
 * NFR-003: comprueba que una recomendación conserve respaldo autorizado.
 * Debe ejecutarse antes de aprobar o aplicar una recomendación.
 */
export async function assertInteractionCurrentlySupported(
  interaction: AiInteraction,
  user: AuthUser,
): Promise<void> {
  if (interaction.userId !== user.id) {
    throw Errors.notFound('Interaction');
  }

  if (interaction.references.length === 0) {
    throw Errors.invalidState(
      'La recomendación no tiene referencias verificadas y no puede aprobarse ni aplicarse.',
    );
  }

  const reader = getSourceReader();

  for (const reference of interaction.references) {
    const authorization = await sourcesRepository.findById(
      reference.authorizationId,
    );

    if (!authorization || authorization.status !== 'approved') {
      throw Errors.invalidState(
        'El respaldo autorizado de la recomendación ya no está disponible. Solicita una nueva consulta.',
      );
    }

    // NFR-003: la referencia debe coincidir con la autorización.
    if (
      authorization.sourceType !== reference.sourceType ||
      authorization.sourceId !== reference.sourceId ||
      authorization.sourceVersion !== reference.sourceVersion
    ) {
      throw Errors.invalidState(
        'La referencia no coincide con la fuente y versión autorizadas. Solicita una nueva consulta.',
      );
    }

    const snapshot = await reader.read(
      reference.sourceType,
      reference.sourceId,
      user,
    );

    if (!snapshot?.visibleToUser) {
      throw Errors.invalidState(
        'No se puede verificar el acceso a las fuentes de esta recomendación.',
      );
    }

    // NFR-003: comprobar versión, contenido y elegibilidad.
    if (
      !snapshot.eligible ||
      snapshot.version !== authorization.sourceVersion ||
      snapshot.contentHash !== authorization.contentHash
    ) {
      throw Errors.invalidState(
        'La fuente cambió de versión, contenido o estado. Solicita una nueva consulta.',
      );
    }
  }
}