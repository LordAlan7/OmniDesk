import type { AuthUser } from '../types';
import { PERMISSIONS, type Permission } from './permissions';
import { permissionsForRoles } from './rolePermissions';

/**
 * Nivel "Función": ¿puede el usuario ejecutar la operación en abstracto?
 * No consulta el recurso, solo la matriz.
 */
export function can(user: AuthUser, permission: Permission): boolean {
  return permissionsForRoles(user.roles).has(permission);
}

/**
 * Nivel "Registro": ¿puede el usuario ver/operar este ticket?
 * - Quien tenga TICKETS_READ_ALL (Advisor, Manager, Admin) ve todo.
 * - Technician ve los asignados a él y los que él creó.
 * - Employee ve solo los que él creó (FR-018).
 */
export function canAccessTicket(
  ticket: { createdBy: number; assignedTechnicianId: number | null },
  user: AuthUser,
): boolean {
  const perms = permissionsForRoles(user.roles);
  if (perms.has(PERMISSIONS.TICKETS_READ_ALL)) return true;
  if (ticket.createdBy === user.id) return true;
  if (ticket.assignedTechnicianId === user.id) return true;
  return false;
}

/**
 * Predicado para filtrar listas. Se aplica antes de paginar.
 */
export function ticketVisibilityFilter(
  user: AuthUser,
): (ticket: { createdBy: number; assignedTechnicianId: number | null }) => boolean {
  return (ticket) => canAccessTicket(ticket, user);
}