import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';
import * as validationsService from './validations.service';
import type { DestinationType } from './validations.types';
import { getTicketForUser } from '../../tickets/tickets.service';

export interface ApplyGuardInput {
  interactionId: number;
  proposalId: string;
  destinationType: DestinationType;
  destinationId?: number;
  /** valores que se van a aplicar (contenido final revisado) */
  payload: unknown;
  user: AuthUser;
}

export interface ApplyGuardResult {
  validationId: number;
  contentVersion: string;
}

/**
 * AIR-006 — Guard de aplicación de contenido generado por IA.
 * Debe llamarse SIEMPRE antes de persistir la propuesta como información definitiva.
 */
export async function assertAiValidated(input: ApplyGuardInput): Promise<ApplyGuardResult> {
  // 1. El cliente NO puede autoaprobar
  const body = input.payload as Record<string, unknown> | null | undefined;
  if (body && (body.approved === true || body.validated === true || body.aiApproved === true)) {
    throw Errors.forbidden('La aprobación no puede enviarse desde el cliente.');
  }

  // 2. Hash del contenido que se va a aplicar
  const contentVersion = validationsService.hashContent(input.payload);

 
  // 3. Debe existir validación aprobada vigente para esa versión + destino
  const validation = await validationsService.getActiveValidation(
    input.interactionId,
    contentVersion,
    input.destinationType
  );
  if (!validation) {
    throw Errors.forbidden(
      'La propuesta de IA no tiene una validación humana aprobada para este contenido.'
    );
  }

  // 4. Revalidar permisos sobre el destino
  if (input.destinationType === 'ticket' && input.destinationId) {
    const ticket = await getTicketForUser(input.destinationId, input.user);
    if (!ticket) throw Errors.forbidden('No tienes acceso al ticket de destino.');
  }

  // 5. No reutilizar validaciones de otro revisor salvo Manager (política del repo)
  if (validation.reviewer_id !== input.user.id && !input.user.roles.includes('Manager')) {
    throw Errors.forbidden('Esta validación pertenece a otro revisor.');
  }

  return { validationId: validation.id, contentVersion };
  
}