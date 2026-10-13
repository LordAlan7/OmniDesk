import { Errors } from '../../shared/errors';
import { signAccessToken } from '../../shared/security/jwt';
import { recordAudit } from '../audit';
import { verifyCredentials } from '../users';

export async function login(email: string, password: string) {
  const user = await verifyCredentials(email, password);
  if (!user) {
    recordAudit({ action: 'auth.login_failed', entity: 'user', metadata: { email } });
    // Mensaje genérico: no revelar si el correo existe.
    throw Errors.unauthorized('Invalid email or password.');
  }
  recordAudit({ action: 'auth.login', entity: 'user', entityId: user.id, actorId: user.id });
  return {
    accessToken: signAccessToken(user),
    tokenType: 'Bearer' as const,
    user: { id: user.id, name: user.name, email: user.email, roles: user.roles },
  };
}
