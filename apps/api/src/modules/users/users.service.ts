import bcrypt from 'bcryptjs';
import { Errors } from '../../shared/errors';
import { Role } from '../../shared/types';
import { recordAudit } from '../audit';
import { usersRepository } from './users.repository';
import { PublicUser, User } from './users.types';
import { invalidateUserSessions } from '../../shared/security/jwt';
function protectLastAdministrator(
  user: User,
  nextActive: boolean,
  nextRoles: Role[],
): void {
  const isActiveAdministrator =
    user.active && user.roles.includes('Administrator');

  const remainsActiveAdministrator =
    nextActive && nextRoles.includes('Administrator');

  if (!isActiveAdministrator || remainsActiveAdministrator) {
    return;
  }

  const anotherActiveAdministrator = usersRepository.list().some(
    (other) =>
      other.id !== user.id &&
      other.active &&
      other.roles.includes('Administrator'),
  );

  if (!anotherActiveAdministrator) {
    throw Errors.conflict(
      'No se puede desactivar ni quitar el rol al último administrador activo.',
    );
  }
}

export const toPublic = (
  { passwordHash: _omit, ...rest }: User,
): PublicUser => rest;

export const listUsers = () =>
  usersRepository.list().map(toPublic);

export function getUser(id: number): PublicUser {
  const user = usersRepository.findById(id);

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
  if (usersRepository.findByEmail(data.email)) {
    throw Errors.conflict('Email already registered.');
  }

  const user = usersRepository.add({
    name: data.name,
    email: data.email,
    roles: data.roles,
    active: true,
    passwordHash: await bcrypt.hash(data.password, 10),
  });

  recordAudit({
    action: 'user.created',
    entity: 'user',
    entityId: user.id,
    actorId,
  });

  return toPublic(user);
}

export function updateUser(
  id: number,
  patch: { name?: string; active?: boolean },
  actorId: number,
) {
  const user = usersRepository.findById(id);

  if (!user) throw Errors.notFound('User');

  protectLastAdministrator(
    user,
    patch.active ?? user.active,
    user.roles,
  );

  Object.assign(user, patch);

  if (patch.active === false) {
  invalidateUserSessions(user.id);
}

  recordAudit({
    action: 'user.updated',
    entity: 'user',
    entityId: id,
    actorId,
    metadata: patch,
  });

  return toPublic(user);
}

export function setUserRoles(
  id: number,
  roles: Role[],
  actorId: number,
) {
  const user = usersRepository.findById(id);

  if (!user) throw Errors.notFound('User');

  protectLastAdministrator(user, user.active, roles);

  const before = [...user.roles];
  user.roles = [...roles];

  recordAudit({
    action: 'user.roles_changed',
    entity: 'user',
    entityId: id,
    actorId,
    metadata: {
      before,
      after: [...roles],
    },
  });

  return toPublic(user);
}

// Valida credenciales sin exponer el hash.
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = usersRepository.findByEmail(email);

  if (!user || !user.active) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);

  return valid ? toPublic(user) : null;
}

export const findUserById = (
  id: number,
): PublicUser | undefined => {
  const user = usersRepository.findById(id);

  return user ? toPublic(user) : undefined;
};

export const isActiveTechnician = (id: number): boolean => {
  const user = usersRepository.findById(id);

  return (
    !!user &&
    user.active &&
    user.roles.includes('Technician')
  );
};