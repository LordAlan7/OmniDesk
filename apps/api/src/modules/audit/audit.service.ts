import { redactSensitive } from '../../shared/security/redact';
import { auditRepository } from './audit.repository';
import { AuditInput, AuditRecord } from './audit.types';

export function recordAudit(input: Partial<AuditInput> & Pick<AuditInput, 'action' | 'entity'>): AuditRecord {
  return auditRepository.add({
    entityId: null,
    actorId: null,
    ...input,
    // NFR-002: nunca persistir credenciales/tokens en la bitácora.
    metadata: redactSensitive(input.metadata ?? {}),
  });
}

export const listAudit = (filters: { entity?: string; action?: string; actorId?: number }) =>
  auditRepository
    .list()
    .filter(
      (r) =>
        (!filters.entity || r.entity === filters.entity) &&
        (!filters.action || r.action === filters.action) &&
        (filters.actorId === undefined || r.actorId === filters.actorId),
    );

export const getAudit = (id: number) => auditRepository.findById(id);
