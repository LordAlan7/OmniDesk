export interface AuditRecord {
  id: number;
  action: string; // ej: "ticket.created"
  entity: string; // ej: "ticket"
  entityId: number | null;
  actorId: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type AuditInput = Omit<AuditRecord, 'id' | 'createdAt'>;
