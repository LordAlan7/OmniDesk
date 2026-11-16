import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import * as database from '../../shared/db/pool';
import { postgresAuditRepository } from './audit.postgres.repository';

const testUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testUrl ? describe : describe.skip;

// Requiere una base dedicada: TEST_DATABASE_URL=postgresql://.../omnidesk_test
describeDatabase('NFR-009 PostgreSQL audit integration', () => {
  let connection: Pool;
  let admin: Pool;
  let spy: jest.SpyInstance;
  const schema = `qa_audit_${randomUUID().replace(/-/g, '')}`;

  beforeAll(async () => {
    if (new URL(testUrl!).pathname !== '/omnidesk_test') throw new Error('Usa exclusivamente omnidesk_test.');
    admin = new Pool({ connectionString: testUrl });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    connection = new Pool({ connectionString: testUrl, options: `-c search_path=${schema}` });
    spy = jest.spyOn(database, 'getPool').mockReturnValue(connection);

    for (const name of ['001_init.sql', '002_users_constraints.sql', '004_audit_constraints.sql', '004_ticket_assignment.sql', '009_audit_traceability.sql']) {
      await connection.query(fs.readFileSync(path.join(__dirname, '../../../db/migrations', name), 'utf8'));
    }
    await connection.query(`INSERT INTO users(id,name,email,password_hash) VALUES (1,'A','a@x.com','h'),(2,'B','b@x.com','h')`);
  }, 30000);

  afterAll(async () => {
    spy?.mockRestore();
    await connection?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  it('stores, filters and paginates events', async () => {
    await postgresAuditRepository.add({ action: 'ticket.assigned', entity: 'ticket', entityId: 7, actorId: 1, correlationId: 'req-1', metadata: { to: 2 } });
    await postgresAuditRepository.add({ action: 'auth.login_failed', entity: 'user', entityId: null, actorId: null, outcome: 'rejected', metadata: {} });

    const byTicket = await postgresAuditRepository.list({ entity: 'ticket', entityId: 7 }, 1, 10);
    expect(byTicket.total).toBe(1);
    expect(byTicket.items[0]).toMatchObject({ action: 'ticket.assigned', actorId: 1, correlationId: 'req-1', outcome: 'applied' });

    const rejected = await postgresAuditRepository.list({ outcome: 'rejected' }, 1, 10);
    expect(rejected.items.map((r) => r.action)).toEqual(['auth.login_failed']);
    expect((await postgresAuditRepository.list({ from: '2099-01-01T00:00:00Z' }, 1, 10)).total).toBe(0);
  });

  it('rejects update, delete and truncate even for the application connection', async () => {
    await expect(connection.query(`UPDATE audit_log SET action = 'x'`)).rejects.toThrow(/append-only/);
    await expect(connection.query(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/);
    await expect(connection.query(`TRUNCATE audit_log`)).rejects.toThrow(/append-only/);
    await expect(connection.query(`UPDATE ticket_history SET action = 'x'`)).resolves.toBeDefined(); // sin filas
  });

  it('keeps the record, with a null actor, when the account is deleted', async () => {
    await postgresAuditRepository.add({ action: 'user.updated', entity: 'user', entityId: 2, actorId: 2, metadata: {} });
    await connection.query('DELETE FROM users WHERE id = 2');
    const after = await connection.query(`SELECT actor_id FROM audit_log WHERE action = 'user.updated'`);
    expect(after.rows).toEqual([{ actor_id: null }]);
  });

  it('rolls the business change back when its audit insert fails', async () => {
    await connection.query("ALTER TABLE audit_log ADD CONSTRAINT fail_audit CHECK (action <> 'ticket.created') NOT VALID");
    const client = await connection.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO tickets(id,title,description,category_id,created_by) VALUES (900,'t','d',1,1)`).catch(() => undefined);
      await expect(
        postgresAuditRepository.addInTransaction(client, { action: 'ticket.created', entity: 'ticket', entityId: 900, actorId: 1, metadata: {} }),
      ).rejects.toThrow();
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await connection.query('ALTER TABLE audit_log DROP CONSTRAINT fail_audit');
    }
    expect((await connection.query(`SELECT 1 FROM audit_log WHERE entity_id = 900`)).rowCount).toBe(0);
  });
});
