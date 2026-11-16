import { can, PERMISSIONS } from '../../../shared/authorization';
import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';
import { getTicketForUser } from '../../tickets';

/**
 * Contexto de ticket para el asistente (AIR-008).
 *
 * - Requiere un permiso propio: poder consultar a la IA NO da acceso a tickets.
 * - El ticket se obtiene por el servicio autorizado (404 si no existe o no es accesible, sin distinguir).
 * - Lista blanca de campos: un campo nuevo del ticket nunca llega al modelo por omisión. No se envían
 *   solicitante, técnico, resolución interna ni datos comerciales.
 */
export interface TicketContext {
  ticketId: number;
  title: string;
  description: string;
  status: string;
  categoryId: number;
}

export async function buildTicketContext(ticketId: number, user: AuthUser): Promise<TicketContext> {
  if (!can(user, PERMISSIONS.AI_CONTEXT_TICKETS)) throw Errors.forbidden();

  const ticket = await getTicketForUser(ticketId, user);

  return {
    ticketId: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    categoryId: ticket.categoryId,
  };
}

/** El texto del ticket es dato del usuario: se enmarca igual que las fuentes y no puede dar instrucciones. */
export function frameTicketContext(context: TicketContext): string {
  const neutralize = (value: string) => value.replace(/\[\/?TICKET[^\]]*\]/gi, '[…]');
  return [
    `[TICKET id=${context.ticketId} status=${context.status}]`,
    `Título: ${neutralize(context.title)}`,
    `Descripción: ${neutralize(context.description)}`,
    '[/TICKET]',
  ].join('\n');
}
