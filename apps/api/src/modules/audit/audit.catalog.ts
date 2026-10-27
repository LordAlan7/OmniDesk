/**
 * Catálogo común de eventos auditables (NFR-009).
 *
 * Toda acción que se registre en `audit_log` debe estar aquí. La prueba de cobertura
 * (`audit.catalog.test.ts`) falla si el código registra una acción que no está en el catálogo.
 *
 * - `outcome: 'applied'`  → el cambio se confirmó.
 * - `outcome: 'rejected'` → intento fallido; NO es un cambio realizado.
 * - `implemented: false`  → evento reservado para un módulo pendiente (p. ej. IA, FR-013/FR-015).
 * - `valuesInAudit: false` → los valores anterior/nuevo viven solo en TicketHistory (texto libre).
 */
export type AuditOutcome = 'applied' | 'rejected';

export interface AuditEventDefinition {
  entity: string;
  module: string;
  description: string;
  outcome: AuditOutcome;
  implemented: boolean;
  /** Acción equivalente en `ticket_history`, si el evento también forma parte de la línea de tiempo del ticket. */
  historyAction?: string;
  valuesInAudit?: boolean;
}

const event = (
  entity: string,
  module: string,
  description: string,
  extra: Partial<AuditEventDefinition> = {},
): AuditEventDefinition => ({ entity, module, description, outcome: 'applied', implemented: true, ...extra });

export const AUDIT_EVENTS = {
  // Autenticación
  'auth.login': event('user', 'auth', 'Inicio de sesión correcto.'),
  'auth.login_failed': event('user', 'auth', 'Intento de inicio de sesión fallido.', { outcome: 'rejected' }),
  'auth.logout': event('user', 'auth', 'Cierre de sesión.'),

  // Usuarios
  'user.created': event('user', 'users', 'Cuenta creada.'),
  'user.updated': event('user', 'users', 'Cuenta, roles o estado actualizados.'),

  // Tickets (cada uno tiene su evento gemelo en ticket_history)
  'ticket.created': event('ticket', 'tickets', 'Ticket creado.', { historyAction: 'created' }),
  'ticket.updated': event('ticket', 'tickets', 'Título, descripción o categoría editados.', { historyAction: 'updated' }),
  'ticket.status_changed': event('ticket', 'tickets', 'Cambio de estado (incluye resolución y cierre).', { historyAction: 'status_changed' }),
  'ticket.assigned': event('ticket', 'tickets', 'Asignación o reasignación de técnico.', { historyAction: 'assigned' }),
  'ticket.priority_changed': event('ticket', 'tickets', 'Cambio de prioridad.', { historyAction: 'priority_changed' }),
  'ticket.category_changed': event('ticket', 'tickets', 'Cambio de categoría.', { historyAction: 'category_changed' }),
  'ticket.business_info_updated': event('ticket', 'tickets', 'Cambio de tienda o modelo de motocicleta.', { historyAction: 'business_info_updated' }),
  'ticket.deadline_changed': event('ticket', 'tickets', 'Plazo establecido, modificado o eliminado.', { historyAction: 'deadline_changed' }),
  'ticket.progress_update': event('ticket', 'tickets', 'Nota de avance registrada (el texto solo vive en TicketHistory).', {
    historyAction: 'progress_update',
    valuesInAudit: false,
  }),
  // FR-009: investigación documentada por el técnico. El contenido (actividad, resultado,
  // referencia a conocimiento) vive en ticket_investigations; la auditoría solo registra
  // que ocurrió, quién y cuándo (NFR-009: valuesInAudit=false, igual que progress_update).
  'ticket.investigation_logged': event('ticket', 'tickets', 'Actividad de investigación registrada (el contenido vive en ticket_investigations).', {
    historyAction: 'investigation_logged',
    valuesInAudit: false,
  }),
  // FR-009: reapertura de un ticket resuelto. El motivo (reason) es obligatorio y se
  // conserva tanto en ticket_history.reason como en metadata.reason de la auditoría.
  'ticket.reopened': event('ticket', 'tickets', 'Ticket reabierto desde Resolved a In Progress.', {
    historyAction: 'reopened',
  }),
  'ticket.attachment_uploaded': event('ticket', 'files', 'Archivo adjunto cargado.'),

  // Conocimiento
  'knowledge.created': event('article', 'knowledge', 'Artículo creado.'),
  'knowledge.updated': event('article', 'knowledge', 'Artículo editado.'),
  'knowledge.draft': event('article', 'knowledge', 'Artículo devuelto a borrador.'),
  'knowledge.approved': event('article', 'knowledge', 'Artículo aprobado.'),
  'knowledge.retired': event('article', 'knowledge', 'Artículo retirado.'),
  'document.created': event('knowledge_document', 'knowledge', 'Documento (manual) creado.'),
  'document.metadata.updated': event('knowledge_document', 'knowledge', 'Metadatos del documento actualizados.'),
  'document.publication.updated': event('knowledge_document', 'knowledge', 'Publicación del documento actualizada.'),

  // IA (FR-013 / FR-015): reservados. Distinguen propuesta, revisión, aprobación y aplicación.
  'ai.suggestion_generated': event('ai_interaction', 'ai', 'La IA generó una propuesta (AIInteraction).', { implemented: false }),
  'ai.suggestion_reviewed': event('ai_validation', 'ai', 'Una persona revisó la propuesta (AIValidation).', { implemented: false }),
  'ai.suggestion_approved': event('ai_validation', 'ai', 'Una persona aprobó la propuesta.', { implemented: false }),
  'ai.suggestion_rejected': event('ai_validation', 'ai', 'Una persona rechazó la propuesta.', { implemented: false }),
  'ai.suggestion_applied': event('ai_interaction', 'ai', 'La propuesta aprobada se aplicó a un recurso.', { implemented: false }),
  'ai.request_failed': event('ai_interaction', 'ai', 'Error relevante del proveedor de IA (sin claves ni contexto innecesario).', {
    outcome: 'rejected',
    implemented: false,
  }),
} as const satisfies Record<string, AuditEventDefinition>;

export type AuditAction = keyof typeof AUDIT_EVENTS;

export const AUDIT_ACTIONS = Object.keys(AUDIT_EVENTS) as AuditAction[];

export function auditDefinition(action: string): AuditEventDefinition | undefined {
  return (AUDIT_EVENTS as Record<string, AuditEventDefinition>)[action];
}

/** Acción de auditoría equivalente a un evento de ticket_history (undefined = solo historial). */
export function auditActionForHistory(historyAction: string): AuditAction | undefined {
  return AUDIT_ACTIONS.find((action) => AUDIT_EVENTS[action].historyAction === historyAction);
}

/** Eventos de ticket_history que NO generan auditoría propia (los cubre otro evento). */
export const HISTORY_ONLY_ACTIONS: readonly string[] = ['closed_comment'];
