import type { Role } from '../types'; // ← fuente única de verdad (shared/types.ts)
import { PERMISSIONS, type Permission } from './permissions';

/**
 * Matriz de autorización (NFR-001).
 *
 * Reglas:
 * - Denegación por defecto: lo que no está aquí, se rechaza.
 * - Combinación de roles múltiples: UNIÓN de permisos.
 * - Separación de deberes:
 *     · Administrator gestiona cuentas; NO hace trabajo de negocio.
 *     · Manager prioriza y consulta métricas; NO asigna ni resuelve.
 *     · Service Advisor asigna y supervisa; NO cambia prioridad ni resuelve.
 *     · Technician resuelve lo asignado y puede cerrarlo si sigue siendo el
 *       responsable actual; la reasignación le transfiere el cierre al nuevo
 *       responsable (FR-009: "a menos que pase la responsabilidad").
 */
const MATRIX: Record<Role, readonly Permission[]> = {
  Employee: [
    PERMISSIONS.TICKETS_CREATE,
    PERMISSIONS.TICKETS_READ,
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.AI_QUERY,
    PERMISSIONS.NOTIFICATIONS_READ_OWN,
    PERMISSIONS.NOTIFICATIONS_UPDATE_OWN,
  ],

  Technician: [
    PERMISSIONS.TICKETS_CREATE,
    PERMISSIONS.TICKETS_READ,
    PERMISSIONS.TICKETS_UPDATE,
    PERMISSIONS.TICKETS_STATUS_UPDATE,
    PERMISSIONS.TICKETS_RESOLVE,
    PERMISSIONS.TICKETS_CLOSE,
    PERMISSIONS.TICKETS_PROGRESS_CREATE,
    PERMISSIONS.TICKETS_HISTORY_READ,
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.KNOWLEDGE_CREATE,
    PERMISSIONS.KNOWLEDGE_UPDATE,
    PERMISSIONS.AI_QUERY,
    PERMISSIONS.AI_VALIDATE,
    PERMISSIONS.NOTIFICATIONS_READ_OWN,
    PERMISSIONS.NOTIFICATIONS_UPDATE_OWN,
  ],

  'Service Advisor': [
    PERMISSIONS.TICKETS_CREATE,
    PERMISSIONS.TICKETS_READ,
    PERMISSIONS.TICKETS_READ_ALL,
    PERMISSIONS.TICKETS_UPDATE,
    PERMISSIONS.TICKETS_ASSIGN,
    PERMISSIONS.TICKETS_STATUS_UPDATE,
    PERMISSIONS.TICKETS_CLOSE,
    PERMISSIONS.TICKETS_DEADLINE_UPDATE,
    PERMISSIONS.TICKETS_PROGRESS_CREATE,
    PERMISSIONS.TICKETS_HISTORY_READ,
    PERMISSIONS.USERS_READ_LIST,
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.KNOWLEDGE_CREATE,
    PERMISSIONS.KNOWLEDGE_UPDATE,
    PERMISSIONS.AI_QUERY,
    PERMISSIONS.AI_VALIDATE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.NOTIFICATIONS_READ_OWN,
    PERMISSIONS.NOTIFICATIONS_UPDATE_OWN,
  ],

   Manager: [
    PERMISSIONS.TICKETS_READ,
    PERMISSIONS.TICKETS_READ_ALL,
    PERMISSIONS.TICKETS_PRIORITY_UPDATE,
    PERMISSIONS.TICKETS_CLOSE,
    PERMISSIONS.TICKETS_HISTORY_READ,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_READ_LIST,
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.KNOWLEDGE_CREATE,
    PERMISSIONS.KNOWLEDGE_UPDATE,
    PERMISSIONS.KNOWLEDGE_PUBLISH,
    PERMISSIONS.AI_QUERY,
    PERMISSIONS.AI_VALIDATE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_READ_GLOBAL,
    PERMISSIONS.AUDIT_READ,            // ← NUEVO (Opción A)
    PERMISSIONS.NOTIFICATIONS_READ_OWN,
    PERMISSIONS.NOTIFICATIONS_UPDATE_OWN,
  ],

  Administrator: [
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_READ_LIST,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DEACTIVATE,
    PERMISSIONS.USERS_ASSIGN_ROLES,
    PERMISSIONS.TICKETS_READ,          // puede leer tickets puntuales por id si tiene acceso
    PERMISSIONS.TICKETS_HISTORY_READ,  // puede ver historial de los que él creó
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.AI_QUERY,
    PERMISSIONS.AUDIT_READ,            // ← así audita en lugar de husmear tickets
    PERMISSIONS.NOTIFICATIONS_READ_OWN,
    PERMISSIONS.NOTIFICATIONS_UPDATE_OWN,
    // NO: TICKETS_READ_ALL  ← Admin no ve todos los tickets (separación de deberes)
    // NO: TICKETS_ASSIGN, TICKETS_PRIORITY_UPDATE, TICKETS_RESOLVE,
    //     TICKETS_STATUS_UPDATE, TICKETS_CLOSE
  ],
};

/** Permisos efectivos para un conjunto de roles. Regla: UNIÓN. */
export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    const perms = MATRIX[role];
    if (perms) for (const p of perms) result.add(p);
  }
  return result;
}

/** Expuesta para QA/documentación: permite verificar la matriz completa. */
export function getAuthorizationMatrix(): Readonly<Record<Role, readonly Permission[]>> {
  return MATRIX;
}