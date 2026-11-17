/**
 * API pública del módulo de tickets.
 * Otros módulos solo deben importar desde este archivo.
 */
import { ticketsRepository } from './tickets.repository';
import { canAccessTicket } from '../../shared/authorization';
import { findUserById } from '../users';
import type { AuthUser, Role } from '../../shared/types';
import type { Ticket } from './tickets.types';

export { ticketsRouter } from './tickets.routes';

export { getTicketForUser } from './tickets.service';

// AIR-004: el módulo AI necesita aplicar recomendaciones aprobadas al ticket
// reutilizando FR-009 (no duplica lógica). Se exportan los servicios de FR-009
// para que el módulo AI los llame sin tocar el repositorio.
export {
  addInvestigation,
  resolveTicket,
  closeTicket,
  reopenTicket,
  listInvestigations,
  createTicket,
  updateTicket,
} from './tickets.service';

export {
  hasPendingTicketsForTechnician,
  configureArticleReferenceChecker,
  resolveApprovedArticleReference,
} from './tickets.lifecycle';

export type {
  Ticket,
  TicketStatus,
  TicketInvestigation,
  SaveContext,
} from './tickets.types';

/**
 * FR-020: devuelve los IDs de tickets a los que un usuario tiene acceso hoy.
 * Lo usa el módulo notifications para revalidar acceso al listar/contar
 * notificaciones (decisión 3). Si el usuario perdió acceso a un ticket
 * (reasignación, desactivación), sus notificaciones de ese ticket se ocultan.
 *
 * Se inyecta en notifications.service.ts desde app.ts.
 */
export async function accessibleTicketIdsForUser(userId: number): Promise<number[]> {
  const user = await findUserById(userId);
  if (!user) return [];

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles as Role[],
  };

  const tickets: Ticket[] = await ticketsRepository.list({ visibleTo: null });

  return tickets
    .filter((t: Ticket) => canAccessTicket(t, authUser))
    .map((t: Ticket) => t.id);
}