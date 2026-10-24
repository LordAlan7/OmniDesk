/**
 * Módulo AUDIT (NFR-009 - Traceability and auditing)
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { auditRouter } from './audit.routes';
export {
  recordAudit,
  recordAuditInTransaction,
  recordAuditInMemory,
} from './audit.service';
export { AUDIT_EVENTS, auditActionForHistory, HISTORY_ONLY_ACTIONS } from './audit.catalog';
export type { AuditAction } from './audit.catalog';
export type { AuditRecord } from './audit.types';

export { recordDocumentAudit, readDocumentAudit } from './document-audit';
