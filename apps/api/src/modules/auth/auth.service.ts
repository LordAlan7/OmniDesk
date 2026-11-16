import { Errors } from '../../shared/errors';
import { signAccessToken } from '../../shared/security/jwt';
import {
  permissionsForRoles,
} from '../../shared/authorization';
import { recordAudit } from '../audit';
import { findUserById, verifyCredentials } from '../users';

export async function login(email: string, password: string) {
  const user = await verifyCredentials(email, password);

  if (!user) {
    recordAudit({
      action: 'auth.login_failed',
      entity: 'user',
      metadata: { email },
    });

    throw Errors.unauthorized('Invalid email or password.');
  }

  recordAudit({
    action: 'auth.login',
    entity: 'user',
    entityId: user.id,
    actorId: user.id,
  });

  return {
    accessToken: signAccessToken(user),
    tokenType: 'Bearer' as const,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: [...user.roles],
      permissions: [
        ...permissionsForRoles(user.roles),
      ].sort(),
    },
  };
}
/** Identidad y permisos vigentes de la sesión (la fuente de verdad es el servidor). */
export async function getProfile(userId: number) {
  const me = await findUserById(userId);

  if (!me || !me.active) {
    throw Errors.unauthorized('The account is no longer active.');
  }

  return {
    ...me,
    permissions: [...permissionsForRoles(me.roles)].sort(),
  };
}

export function logout(userId: number): void {
  recordAudit({
    action: 'auth.logout',
    entity: 'user',
    entityId: userId,
    actorId: userId,
  });
}
