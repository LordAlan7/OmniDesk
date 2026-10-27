import { postgresTicketsRepository as repository } from './tickets.postgres.repository';
import { getPool } from '../../shared/db/pool';
import type { Ticket } from './tickets.types';

jest.mock('../../shared/db/pool', () => ({ getPool: jest.fn() }));

const row = {
  id: 10, title: 'Falla de acceso', description: 'No se puede iniciar sesión.',
  category_id: 2, priority_id: null, status: 'Assigned', created_by: 3,
  assigned_technician_id: 2, store_location: 'Centro', motorcycle_model: 'FT150',
  due_date: null, resolution: null, created_at: new Date(), updated_at: new Date(),
  resolved_at: null, closed_at: null, version: 2,
};
const ticket: Ticket = {
  id: 10, title: row.title, description: row.description, categoryId: 2,
  priorityId: null, status: 'Assigned', createdBy: 3, assignedTechnicianId: 2,
  storeLocation: 'Centro', motorcycleModel: 'FT150', dueDate: null, resolution: null,
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  resolvedAt: null, closedAt: null, version: 1,
};
let query: jest.Mock;
let release: jest.Mock;
beforeEach(() => {
  query = jest.fn().mockResolvedValue({ rows: [] });
  release = jest.fn();
  (getPool as jest.Mock).mockReturnValue({ connect: async () => ({ query, release }) });
});

it('commits the versioned update and JSON history together, preserving business fields', async () => {
  query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('UPDATE') ? [row] : [] }));
  const saved = await repository.saveWithHistory(ticket, 1, [{ actorId: 3, action: 'assigned', from: null, to: 2, reason: 'Cambio de responsable' }]);
  expect(saved).toMatchObject({ storeLocation: 'Centro', motorcycleModel: 'FT150', version: 2 });
  const update = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'))!;
  expect(update[0]).toContain('WHERE id = $11 AND version = $12');
  expect(update[1].slice(10)).toEqual([10, 1, 'Centro', 'FT150']);
  const event = query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO ticket_history'))!;
  expect(event[1]).toEqual([10, 3, 'assigned', 'null', '2', 'Cambio de responsable', null]);
  // NFR-009: la auditoría se confirma en la misma transacción que el cambio.
  const calls = query.mock.calls.map(([sql]) => String(sql));
  const auditAt = calls.findIndex((sql) => sql.includes('INSERT INTO audit_log'));
  expect(auditAt).toBeGreaterThan(calls.findIndex((sql) => sql.startsWith('UPDATE')));
  expect(auditAt).toBeLessThan(calls.lastIndexOf('COMMIT'));
  expect(query.mock.calls[auditAt]![1].slice(0, 2)).toEqual(['ticket.assigned', 'ticket']);
  expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  expect(release).toHaveBeenCalledTimes(1);
});

it('rolls back the ticket change when the audit insert fails (no change without audit)', async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO audit_log')) throw new Error('audit unavailable');
    return { rows: sql.startsWith('UPDATE') ? [row] : [] };
  });
  await expect(repository.saveWithHistory(ticket, 1, [{ actorId: 3, action: 'assigned', to: 2 }])).rejects.toThrow('audit unavailable');
  const calls = query.mock.calls.map(([sql]) => String(sql));
  expect(calls).not.toContain('COMMIT');
  expect(calls.at(-1)).toBe('ROLLBACK');
});

it('rolls back stale versions without inserting history', async () => {
  await expect(repository.saveWithHistory(ticket, 1, [{ actorId: 3, action: 'assigned', to: 2 }])).rejects.toMatchObject({ status: 409 });
  expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  expect(release).toHaveBeenCalledTimes(1);
});

it('rolls back the ticket update if history insertion fails', async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith('INSERT')) throw new Error('history unavailable');
    return { rows: sql.startsWith('UPDATE') ? [row] : [] };
  });
  await expect(repository.saveWithHistory(ticket, 1, [{ actorId: 3, action: 'assigned', to: 2 }])).rejects.toThrow('history unavailable');
  expect(query.mock.calls.map(([sql]) => sql)).not.toContain('COMMIT');
  expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  expect(release).toHaveBeenCalledTimes(1);
});
