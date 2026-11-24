import { findSuggestionInteractionPersisted } from '../interactions/interactions.service';

import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';

import * as validationsService from './validations.service';
import type { DestinationType } from './validations.types';

import { getTicketForUser } from '../ai.ports';

import { interactionsService } from '../interactions/interactions.service';
import { assertInteractionCurrentlySupported } from '../interactions/interactions';

export interface ApplyGuardInput {
  interactionId: number;
  proposalId: string;
  destinationType: DestinationType;
  destinationId?: number;

  /** Contenido final que se pretende aplicar. */
  payload: unknown;

  user: AuthUser;
}

export interface ApplyGuardResult {
  validationId: number;
  contentVersion: string;
}

/**
 * AIR-006 + FR-015 + NFR-003
 *
 * Impide aplicar una recomendación de IA cuando:
 * - No existe la interacción.
 * - No pertenece al usuario.
 * - No hay respaldo autorizado vigente.
 * - No existe una aprobación humana para el contenido.
 * - La aprobación corresponde a otra propuesta o destino.
 * - El usuario no tiene acceso al ticket.
 */
export async function assertAiValidated(
  input: ApplyGuardInput,
): Promise<ApplyGuardResult> {
  // 1. Impedir que el cliente se autoapruebe.
  const body =
    input.payload !== null &&
    typeof input.payload === 'object' &&
    !Array.isArray(input.payload)
      ? input.payload as Record<string, unknown>
      : null;

  if (
    body?.approved === true ||
    body?.validated === true ||
    body?.aiApproved === true
  ) {
    throw Errors.forbidden(
      'La aprobación no puede enviarse desde el cliente.',
    );
  }

  // 2. Recuperar la interacción de FR-015.
  const interaction = await interactionsService.findById(
    input.interactionId,
  );

  if (
    !interaction ||
    interaction.userId !== input.user.id
  ) {
    throw Errors.notFound('Interaction');
  }

  // 3. Revalidar el respaldo documental.
  // Comprueba autorizaciones reales, versiones,
  // permisos, contenido y elegibilidad de las fuentes.
  await assertInteractionCurrentlySupported(
    interaction,
    input.user,
  );

  // 4. Calcular la versión exacta del contenido.
  const contentVersion = validationsService.hashContent(
    input.payload,
  );

  // 5. Buscar la aprobación humana correspondiente.
  const validation =
    await validationsService.getActiveValidation(
      input.interactionId,
      contentVersion,
      input.destinationType,
    );

  if (!validation) {
    throw Errors.forbidden(
      'La propuesta de IA no tiene una validación humana aprobada para este contenido.',
    );
  }

  // 6. Comprobar la propuesta aprobada.
  if (validation.proposal_id !== input.proposalId) {
    throw Errors.forbidden(
      'La aprobación corresponde a otra propuesta.',
    );
  }

  // 7. Impedir una aplicación a otro destino.
  if (
    input.destinationId !== undefined &&
    validation.destination_id !== input.destinationId
  ) {
    throw Errors.forbidden(
      'La aprobación no corresponde al destino solicitado.',
    );
  }

  // 8. Comprobar que la validación sigue aprobada.
  if (validation.decision !== 'approved') {
    throw Errors.forbidden(
      'La recomendación no tiene una aprobación vigente.',
    );
  }

  // 9. Impedir reutilizar una aprobación aplicada.
  if (validation.applied_at !== null) {
    throw Errors.forbidden(
      'Esta aprobación ya fue utilizada.',
    );
  }

  // 10. Validar la identidad del revisor.
  if (
    validation.reviewer_id !== input.user.id &&
    !input.user.roles.includes('Manager')
  ) {
    throw Errors.forbidden(
      'Esta validación pertenece a otro revisor.',
    );
  }

  // 11. Verificar permisos sobre el ticket.
  if (input.destinationType === 'ticket') {
    if (
      input.destinationId === undefined ||
      !Number.isInteger(input.destinationId) ||
      input.destinationId <= 0
    ) {
      throw Errors.forbidden(
        'Se requiere un ticket de destino válido.',
      );
    }

    if (interaction.ticketId !== input.destinationId) {
      throw Errors.forbidden(
        'El ticket no coincide con la interacción original.',
      );
    }

    const ticket = await getTicketForUser(
      input.destinationId,
      input.user,
    );

    if (!ticket) {
      throw Errors.forbidden(
        'No tienes acceso al ticket de destino.',
      );
    }
  }

  return {
    validationId: validation.id,
    contentVersion,
  };
}

/** AIR-005 only: validate approval of newly created ticket fields.
 * This does NOT loosen the source-verification requirements for FR-015.
 */
export async function assertAiTicketCreationValidated(input: {
  interactionId: number;
  suggestionId: number;
  proposalId: string;
  payload: unknown;
  user: AuthUser;
}): Promise<ApplyGuardResult> {
  const body = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? input.payload as Record<string, unknown> : null;
  if (!body || body.approved === true || body.validated === true || body.aiApproved === true) {
    throw Errors.forbidden('La aprobación no puede enviarse desde el cliente.');
  }
  const interaction = await findSuggestionInteractionPersisted(input.interactionId);
  if (!interaction || interaction.userId !== input.user.id ||
      interaction.ticketId != null ||
      interaction.generationConfig?.feature !== 'AIR-005' ||
      interaction.generationConfig?.suggestionId !== input.suggestionId ||
      input.proposalId !== String(input.suggestionId)) {
    throw Errors.notFound('Interaction');
  }
  // Field suggestions are not document-backed recommendations.
  // Only AIR-005's persisted interaction may bypass the FR-015 source guard.
  const contentVersion = validationsService.hashContent(input.payload);
  const validation = await validationsService.getActiveValidation(
    input.interactionId, contentVersion, 'ticket',
  );
  if (!validation || validation.proposal_id !== input.proposalId ||
      validation.destination_id !== null || validation.decision !== 'approved' ||
      validation.applied_at !== null ||
      (validation.reviewer_id !== input.user.id && !input.user.roles.includes('Manager'))) {
    throw Errors.forbidden('La sugerencia no tiene una aprobación humana vigente para crear este ticket.');
  }
  return { validationId: validation.id, contentVersion };
}
