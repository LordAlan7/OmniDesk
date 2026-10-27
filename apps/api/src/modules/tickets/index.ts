/**
 * API pública del módulo de tickets.
 * Otros módulos solo deben importar desde este archivo.
 */
export { ticketsRouter } from './tickets.routes';

export { getTicketForUser } from './tickets.service';

export {
  hasPendingTicketsForTechnician,
  configureArticleReferenceChecker,
  resolveApprovedArticleReference,
} from './tickets.lifecycle';

export type {
  Ticket,
  TicketStatus,
  TicketInvestigation,
} from './tickets.types';