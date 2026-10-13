/**
 * Módulo AUDIT (NFR-009 - Traceability and auditing)
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { auditRouter } from './audit.routes';
export { recordAudit } from './audit.service';
export type { AuditRecord } from './audit.types';
