/**
 * Módulo TICKETS - núcleo del sistema
 * FR-003, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-018, NFR-010
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { ticketsRouter } from './tickets.routes';
export { getTicketForUser } from './tickets.service';
export type { Ticket, TicketStatus } from './tickets.types';
