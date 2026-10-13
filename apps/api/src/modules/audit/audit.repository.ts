import { AuditInput, AuditRecord } from './audit.types';

// Solo se puede AGREGAR y LEER. No hay update ni delete (NFR-009).
const records: AuditRecord[] = [];
let nextId = 1;

export const auditRepository = {
  add(input: AuditInput): AuditRecord {
    const record: AuditRecord = { ...input, id: nextId++, createdAt: new Date().toISOString() };
    records.push(record);
    return record;
  },
  findById: (id: number) => records.find((r) => r.id === id),
  list: () => [...records].reverse(),
};
