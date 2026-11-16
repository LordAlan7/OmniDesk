import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import * as database from '../../shared/db/pool';
import {
  postgresUsersRepository as repository,
} from './users.postgres.repository';

const testUrl = process.env.TEST_DATABASE_URL;

const describePostgres = testUrl ? describe : describe.skip;

describePostgres('users - PostgreSQL integration', () => {
  let connection: Pool;
  let administrativeConnection: Pool;
  let poolSpy: jest.SpyInstance;
  let schemaCreated = false;

  const schema = `qa_users_${randomUUID().replace(/-/g, '')}`;

  beforeAll(async () => {
    const url = new URL(testUrl!);

    if (url.pathname !== '/omnidesk_test') {
      throw new Error(
        'Estas pruebas requieren la base omnidesk_test.',
      );
    }

    administrativeConnection = new Pool({
      connectionString: testUrl,
    });

    await administrativeConnection.query(
      `CREATE SCHEMA "${schema}"`,
    );

    schemaCreated = true;

    connection = new Pool({
      connectionString: testUrl,
      options: `-c search_path=${schema}`,
    });

    poolSpy = jest
      .spyOn(database, 'getPool')
      .mockReturnValue(connection);

    const migrations = [
      '001_init.sql',
      '002_users_constraints.sql',
    ];

    for (const migration of migrations) {
      const sql = fs.readFileSync(
        path.join(
          __dirname,
          '../../../db/migrations',
          migration,
        ),
        'utf8',
      );

      await connection.query(sql);
    }
  }, 30000);

  afterAll(async () => {
    poolSpy?.mockRestore();

    if (connection) {
      await connection.end();
    }

    if (administrativeConnection) {
      if (schemaCreated) {
        await administrativeConnection.query(
          `DROP SCHEMA "${schema}" CASCADE`,
        );
      }

      await administrativeConnection.end();
    }
  });

  function account(email: string) {
    return {
      name: 'Usuario PostgreSQL',
      email,
      passwordHash: 'hash-de-prueba-del-repositorio',
      roles: ['Employee'] as ('Employee' | 'Technician' | 'Administrator')[],
      active: true,
    };
  }

  it('stores users and roles and reads them through another connection', async () => {
    const created = await repository.add({
      ...account('persistencia@qa.local'),
      roles: ['Employee', 'Technician'],
    });

    const independent = new Pool({
      connectionString: testUrl,
      options: `-c search_path=${schema}`,
    });

    try {
      const result = await independent.query(
        `SELECT u.email, r.name AS role
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.id = $1`,
        [created.id],
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows.map((row) => row.role)).toEqual(
        expect.arrayContaining(['Employee', 'Technician']),
      );

      const found = await repository.findById(created.id);

      expect(found?.email).toBe('persistencia@qa.local');
    } finally {
      await independent.end();
    }
  });

  it('rejects duplicate emails and leaves a single account', async () => {
    await repository.add(account('duplicado@qa.local'));

    await expect(
      repository.add(account(' DUPLICADO@qa.local ')),
    ).rejects.toMatchObject({
      message: 'El correo electrónico ya está registrado.',
    });

    const result = await connection.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE lower(btrim(email)) = $1`,
      ['duplicado@qa.local'],
    );

    expect(result.rows[0].count).toBe(1);
  });

  it('does not create an account with nonexistent roles', async () => {
    const invalid = {
      ...account('rol-invalido@qa.local'),
      roles: ['InvalidRole'] as unknown as ['Employee'],
    };

    await expect(repository.add(invalid)).rejects.toThrow();

    expect(
      await repository.findByEmail('rol-invalido@qa.local'),
    ).toBeUndefined();
  });

  it('rolls back name, email and roles when an update fails', async () => {
    const first = await repository.add(
      account('primero@qa.local'),
    );

    const second = await repository.add(
      account('segundo@qa.local'),
    );

    await expect(
      repository.update(second.id, {
        name: 'No debe guardarse',
        email: first.email,
        roles: ['Technician'],
      }),
    ).rejects.toThrow();

    const unchanged = await repository.findById(second.id);

    expect(unchanged?.name).toBe(second.name);
    expect(unchanged?.email).toBe(second.email);
    expect(unchanged?.roles).toEqual(['Employee']);
  });

  it('persists changes to account data and roles', async () => {
    const created = await repository.add(
      account('editar@qa.local'),
    );

    await repository.update(created.id, {
      name: 'Nombre actualizado',
      email: 'actualizado@qa.local',
      roles: ['Employee', 'Technician'],
      active: false,
    });

    const updated = await repository.findById(created.id);

    expect(updated?.name).toBe('Nombre actualizado');
    expect(updated?.email).toBe('actualizado@qa.local');
    expect(updated?.active).toBe(false);
    expect(updated?.roles).toEqual(
      expect.arrayContaining(['Employee', 'Technician']),
    );
  });

  it('preserves one active administrator during concurrent deactivations', async () => {
    const first = await repository.add({
      ...account('admin.uno@qa.local'),
      roles: ['Administrator'],
    });

    const second = await repository.add({
      ...account('admin.dos@qa.local'),
      roles: ['Administrator'],
    });

    const results = await Promise.allSettled([
      repository.update(first.id, { active: false }),
      repository.update(second.id, { active: false }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);

    const administrators = (await repository.list()).filter(
      (user) =>
        user.active &&
        user.roles.includes('Administrator'),
    );

    expect(administrators).toHaveLength(1);
  });
});