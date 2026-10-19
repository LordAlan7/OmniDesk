import type { PoolClient } from 'pg';
import { getPool } from '../../shared/db/pool';
import { Errors } from '../../shared/errors';
import type { Role } from '../../shared/types';
import type { User } from './users.types';

interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  active: boolean;
  created_at: Date;
  roles: Role[];
}

const SELECT_USERS = `
  SELECT
    u.id,
    u.name,
    u.email,
    u.password_hash,
    u.active,
    u.created_at,
    COALESCE(
      array_agg(r.name ORDER BY r.name)
        FILTER (WHERE r.id IS NOT NULL),
      ARRAY[]::text[]
    ) AS roles
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id
`;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    roles: [...row.roles],
  };
}

async function findByIdWithClient(
  client: PoolClient,
  id: number,
): Promise<User | undefined> {
  const result = await client.query<UserRow>(
    `${SELECT_USERS}
     WHERE u.id = $1
     GROUP BY u.id`,
    [id],
  );

  return result.rows[0] ? toUser(result.rows[0]) : undefined;
}

async function resolveRoleIds(
  client: PoolClient,
  roles: Role[],
): Promise<number[]> {
  if (
    roles.length === 0 ||
    new Set(roles).size !== roles.length
  ) {
    throw Errors.validation([
      {
        field: 'roles',
        message: 'Selecciona roles válidos y sin duplicados.',
      },
    ]);
  }

  const result = await client.query<{ id: number }>(
    'SELECT id FROM roles WHERE name = ANY($1::text[])',
    [roles],
  );

  if (result.rows.length !== roles.length) {
    throw Errors.validation([
      {
        field: 'roles',
        message: 'Uno o más roles no existen.',
      },
    ]);
  }

  return result.rows.map((row) => row.id);
}

function rethrowDatabaseError(cause: unknown): never {
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === '23505'
  ) {
    throw Errors.conflict(
      'El correo electrónico ya está registrado.',
    );
  }

  throw cause;
}

export const postgresUsersRepository = {
  async list(): Promise<User[]> {
    const result = await getPool().query<UserRow>(
      `${SELECT_USERS}
       GROUP BY u.id
       ORDER BY u.id`,
    );

    return result.rows.map(toUser);
  },

  async findById(id: number): Promise<User | undefined> {
    const result = await getPool().query<UserRow>(
      `${SELECT_USERS}
       WHERE u.id = $1
       GROUP BY u.id`,
      [id],
    );

    return result.rows[0] ? toUser(result.rows[0]) : undefined;
  },

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await getPool().query<UserRow>(
      `${SELECT_USERS}
       WHERE lower(btrim(u.email)) = $1
       GROUP BY u.id`,
      [email.trim().toLowerCase()],
    );

    return result.rows[0] ? toUser(result.rows[0]) : undefined;
  },

  async listRoles(): Promise<Role[]> {
    const result = await getPool().query<{ name: Role }>(
      'SELECT name FROM roles ORDER BY id',
    );

    return result.rows.map((row) => row.name);
  },

  async add(
    data: Omit<User, 'id' | 'createdAt'>,
  ): Promise<User> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      const roleIds = await resolveRoleIds(client, data.roles);

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO users (
           name, email, password_hash, active
         )
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          data.name.trim(),
          data.email.trim().toLowerCase(),
          data.passwordHash,
          data.active,
        ],
      );

      const insertedRow = inserted.rows[0];

      if (!insertedRow) {
        throw new Error('No se pudo crear la cuenta.');
      }

      for (const roleId of roleIds) {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES ($1, $2)`,
          [insertedRow.id, roleId],
        );
      }

      const user = await findByIdWithClient(
        client,
        insertedRow.id,
      );

      if (!user) {
        throw new Error('No se pudo consultar la cuenta creada.');
      }

      await client.query('COMMIT');
      return user;
    } catch (cause) {
      await client.query('ROLLBACK');
      rethrowDatabaseError(cause);
    } finally {
      client.release();
    }
  },

  async update(
    id: number,
    patch: {
      name?: string;
      email?: string;
      roles?: Role[];
      active?: boolean;
    },
  ): Promise<User> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      // Protege al último administrador ante cambios simultáneos.
      await client.query(
        'LOCK TABLE users, user_roles IN SHARE ROW EXCLUSIVE MODE',
      );

      const current = await findByIdWithClient(client, id);

      if (!current) throw Errors.notFound('User');

      const nextRoles =
        patch.roles !== undefined
          ? [...patch.roles]
          : [...current.roles];

      const nextActive = patch.active ?? current.active;
      const nextEmail = (
        patch.email ?? current.email
      ).trim().toLowerCase();

      const roleIds = await resolveRoleIds(client, nextRoles);

      const removesActiveAdministrator =
        current.active &&
        current.roles.includes('Administrator') &&
        (!nextActive || !nextRoles.includes('Administrator'));

      if (removesActiveAdministrator) {
        const others = await client.query<{ id: number }>(
          `SELECT u.id
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
           WHERE u.active = TRUE
             AND r.name = 'Administrator'
             AND u.id <> $1
           LIMIT 1`,
          [id],
        );

        if (others.rows.length === 0) {
          throw Errors.conflict(
            'No se puede desactivar ni quitar el rol al último administrador activo.',
          );
        }
      }

      await client.query(
        `UPDATE users
         SET name = $1, email = $2, active = $3
         WHERE id = $4`,
        [
          patch.name?.trim() ?? current.name,
          nextEmail,
          nextActive,
          id,
        ],
      );

      if (patch.roles !== undefined) {
        await client.query(
          'DELETE FROM user_roles WHERE user_id = $1',
          [id],
        );

        for (const roleId of roleIds) {
          await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1, $2)`,
            [id, roleId],
          );
        }
      }

      const updated = await findByIdWithClient(client, id);

      if (!updated) {
        throw new Error('No se pudo consultar la cuenta actualizada.');
      }

      await client.query('COMMIT');
      return updated;
    } catch (cause) {
      await client.query('ROLLBACK');
      rethrowDatabaseError(cause);
    } finally {
      client.release();
    }
  },
};