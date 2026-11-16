import { AUDIT_EVENTS, auditActionForHistory, type AuditAction } from '../audit';

export interface TicketAuditInput {
  action: AuditAction;
  entity: 'ticket';
  entityId: number;
  actorId: number;
  metadata: Record<string, unknown>;
}

/**
 * Traduce un evento de TicketHistory a su evento de auditoría (NFR-009).
 * Devuelve undefined cuando el evento solo vive en el historial (p. ej. comentario de cierre).
 * Cada cambio confirmado en el repositorio genera ambos registros dentro de la misma transacción.
 */
export function ticketAuditFor(
  ticketId: number,
  entry: { actorId: number; action: string; from?: unknown; to?: unknown; reason?: string | null },
): TicketAuditInput | undefined {
  const action = auditActionForHistory(entry.action);
  if (!action) return undefined;

  // Texto libre (notas de avance): la auditoría solo indica que ocurrió; el contenido vive en el historial.
  const withValues = (AUDIT_EVENTS[action] as { valuesInAudit?: boolean }).valuesInAudit !== false;

  return {
    action,
    entity: 'ticket',
    entityId: ticketId,
    actorId: entry.actorId,
    metadata: {
      ...(withValues && entry.from !== undefined ? { from: entry.from } : {}),
      ...(withValues && entry.to !== undefined ? { to: entry.to } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
    },
  };
}
