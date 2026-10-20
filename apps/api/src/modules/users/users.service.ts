import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { Errors } from '../../shared/errors';
import { ROLES, Role } from '../../shared/types';
import {
  invalidateUserSessions,
} from '../../shared/security/jwt';
import { recordAudit } from '../audit';
import { usersRepository as memory } from './users.repository';
import {
  postgresUsersRepository as postgres,
} from './users.postgres.repository';
import { PublicUser, User } from './users.types';
import {
  assertNoPendingTickets,
  withTechnicianLifecycleLock,
} from './users.lifecycle';

const useMemory = env.nodeEnv === 'test';

type UserPatch = {
  name?: string;
  email?: string;
  roles?: Role[];
  active?: boolean;
};

export const toPublic = (
  { passwordHash: _omit, ...rest }: User,
): PublicUser => rest;

async function findInternal(
  id: number,
): Promise<User | undefined> {
  return useMemory
    ? memory.findById(id)
    : postgres.findById(id);
}

async function findByEmail(
  email: string,
): Promise<User | undefined> {
  return useMemory
    ? memory.findByEmail(email.trim().toLowerCase())
    : postgres.findByEmail(email);
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = useMemory
    ? memory.list()
    : await postgres.list();

  return users.map(toPublic);
}

export async function listAvailableRoles(): Promise<Role[]> {
  return useMemory ? [...ROLES] : postgres.listRoles();
}

export async function getUser(
  id: number,
): Promise<PublicUser> {
  const user = await findInternal(id);

  if (!user) throw Errors.notFound('User');

  return toPublic(user);
}

export async function createUser(
  data: {
    name: string;
    email: string;
    password: string;
    roles: Role[];
  },
  actorId: number,
): Promise<PublicUser> {
  if (await findByEmail(data.email)) {
    throw Errors.conflict(
      'El correo electrónico ya está registrado.',
    );
  }

  const account = {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    roles: [...data.roles],
    active: true,
    passwordHash: await bcrypt.hash(data.password, 10),
  };

  if (useMemory && memory.findByEmail(account.email)) {
    throw Errors.conflict(
      'El correo electrónico ya está registrado.',
    );
  }

  const user = useMemory
    ? memory.add(account)
    : await postgres.add(account);

  recordAudit({
    action: 'user.created',
    entity: 'user',
    entityId: user.id,
    actorId,
  });

  return toPublic(user);
}

export async function updateUser(
  id: number,
  patch: UserPatch,
  actorId: number,
): Promise<PublicUser> {
  return withTechnicianLifecycleLock(id, async () => {
    const current = await findInternal(id);

    if (!current) throw Errors.notFound('User');

    const nextRoles = patch.roles ?? current.roles;
    const nextActive = patch.active ?? current.active;

    const removesTechnicianAccess =
      current.roles.includes('Technician') &&
      (
        !nextActive ||
        !nextRoles.includes('Technician')
      );

    if (removesTechnicianAccess) {
      await assertNoPendingTickets(id);
    }

    let updated: User;

    if (useMemory) {
      const user = memory.findById(id);

      if (!user) throw Errors.notFound('User');

      const nextEmail = (
        patch.email ?? user.email
      ).trim().toLowerCase();

      const existing = memory.findByEmail(nextEmail);

      if (existing && existing.id !== id) {
        throw Errors.conflict(
          'El correo electrónico ya está registrado.',
        );
      }

      const removesAdministrator =
        user.active &&
        user.roles.includes('Administrator') &&
        (
          !nextActive ||
          !nextRoles.includes('Administrator')
        );

      if (
        removesAdministrator &&
        !memory.list().some(
          (other) =>
            other.id !== id &&
            other.active &&
            other.roles.includes('Administrator'),
        )
      ) {
        throw Errors.conflict(
          'No se puede desactivar ni quitar el rol al último administrador activo.',
        );
      }

      user.name = patch.name ?? user.name;
      user.email = nextEmail;
      user.roles = [...nextRoles];
      user.active = nextActive;

      updated = user;
    } else {
      updated = await postgres.update(id, patch);
    }

    if (patch.active === false) {
      invalidateUserSessions(id);
    }

    recordAudit({
      action: 'user.updated',
      entity: 'user',
      entityId: id,
      actorId,
      metadata: {
        after: {
          name: updated.name,
          email: updated.email,
          roles: [...updated.roles],
          active: updated.active,
        },
      },
    });

    return toPublic(updated);
  });
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await findByEmail(email);

  if (!user || !user.active) return null;

  const valid = await bcrypt.compare(
    password,
    user.passwordHash,
  );

  return valid ? toPublic(user) : null;
}

export async function findUserById(
  id: number,
): Promise<PublicUser | undefined> {
  const user = await findInternal(id);

  return user ? toPublic(user) : undefined;
}

export async function isActiveTechnician(
  id: number,
): Promise<boolean> {
  const user = await findInternal(id);

  return (
    !!user &&
    user.active &&
    user.roles.includes('Technician')
  );
}

export async function setUserRoles(
  id: number,
  roles: Role[],
  actorId: number,
): Promise<PublicUser> {
  return updateUser(id, { roles }, actorId);
}

export async function listActiveTechnicians(): Promise<
  { id: number; name: string }[]
> {
  const users = await listUsers();

  return users
    .filter(
      (user) =>
        user.active && user.roles.includes('Technician'),
    )
    .map((user) => ({
      id: user.id,
      name: user.name,
    }));
}