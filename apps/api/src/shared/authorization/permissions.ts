/**
 * Catálogo de acciones autorizables (NFR-001).
 * Cada acción representa una operación de negocio, no un endpoint HTTP.
 *
 * Regla: denegación por defecto. Lo que no esté en la matriz (rolePermissions.ts)
 * para el rol del usuario, se rechaza.
 */
export const PERMISSIONS = {
  // Users
  USERS_CREATE: 'users:create',
  USERS_READ: 'users:read',
  USERS_READ_LIST: 'users:read:list',
  USERS_UPDATE: 'users:update',
  USERS_DEACTIVATE: 'users:deactivate',
  USERS_ASSIGN_ROLES: 'users:assign:roles',

  // Tickets
  TICKETS_CREATE: 'tickets:create',
  TICKETS_READ: 'tickets:read',
  TICKETS_READ_ALL: 'tickets:read:all',
  TICKETS_UPDATE: 'tickets:update',
  TICKETS_ASSIGN: 'tickets:assign',
  TICKETS_PRIORITY_UPDATE: 'tickets:priority:update',
  TICKETS_STATUS_UPDATE: 'tickets:status:update',
  TICKETS_RESOLVE: 'tickets:resolve',
  TICKETS_CLOSE: 'tickets:close',
  TICKETS_HISTORY_READ: 'tickets:history:read',

  // Knowledge
  KNOWLEDGE_READ: 'knowledge:read',
  KNOWLEDGE_CREATE: 'knowledge:create',
  KNOWLEDGE_UPDATE: 'knowledge:update',
  KNOWLEDGE_PUBLISH: 'knowledge:publish',

  // AI
  AI_QUERY: 'ai:query',
  AI_VALIDATE: 'ai:validate',

  // Reports
  REPORTS_READ: 'reports:read',
  REPORTS_READ_GLOBAL: 'reports:read:global',

  // Audit
  AUDIT_READ: 'audit:read',

  // Notifications
  NOTIFICATIONS_READ_OWN: 'notifications:read:own',
  NOTIFICATIONS_UPDATE_OWN: 'notifications:update:own',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];