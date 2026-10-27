import type { AuditFilters, AuditInput, AuditRecord } from './audit.types';

// Solo se puede AGREGAR y LEER. No hay update ni delete (NFR-009).
const records: AuditRecord[] = [];
let nextId = 1;

export function matchesAuditFilters(record: AuditRecord, filters: AuditFilters): boolean {
  const at = Date.parse(record.createdAt);
  return (
    (!filters.entity || record.entity === filters.entity) &&
    (filters.entityId === undefined || record.entityId === filters.entityId) &&
    (!filters.action || record.action === filters.action) &&
    (filters.actorId === undefined || record.actorId === filters.actorId) &&
    (!filters.outcome || record.outcome === filters.outcome) &&
    (!filters.correlationId || record.correlationId === filters.correlationId) &&
    (!filters.from || at >= Date.parse(filters.from)) &&
    (!filters.to || at <= Date.parse(filters.to))
  );
}

/** Implementación en memoria (pruebas y desarrollo sin BD). */
export const memoryAuditRepository = {
  add(input: AuditInput): AuditRecord {
    const record: AuditRecord = {
      ...input,
      outcome: input.outcome ?? 'applied',
      correlationId: input.correlationId ?? null,
      id: nextId++,
      createdAt: new Date().toISOString(),
    };
    records.push(record);
    return record;
  },
  findById: (id: number) => records.find((r) => r.id === id),
  list(filters: AuditFilters, page: number, limit: number): { items: AuditRecord[]; total: number } {
    const matching = [...records].reverse().filter((r) => matchesAuditFilters(r, filters));
    const start = (page - 1) * limit;
    return { items: matching.slice(start, start + limit), total: matching.length };
  },
};

export function resetAuditRepository(): void {
  records.length = 0;
  nextId = 1;
}
