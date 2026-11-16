import type { AuditOutcome } from './audit.catalog';

export interface AuditRecord {
  id: number;
  action: string; // ej: "ticket.created" (ver audit.catalog.ts)
  entity: string; // ej: "ticket"
  entityId: number | null;
  actorId: number | null;
  /** 'rejected' = intento fallido, no un cambio aplicado. */
  outcome: AuditOutcome;
  /** Relaciona operaciones conectadas (identificador de la petición). */
  correlationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type AuditInput = Omit<AuditRecord, 'id' | 'createdAt' | 'outcome' | 'correlationId'> &
  Partial<Pick<AuditRecord, 'outcome' | 'correlationId'>>;

export interface AuditFilters {
  entity?: string;
  entityId?: number;
  action?: string;
  actorId?: number;
  outcome?: AuditOutcome;
  correlationId?: string;
  from?: string;
  to?: string;
}
