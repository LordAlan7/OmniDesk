import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AuthUser, Role } from '../types';

interface TokenPayload {
  email: string;
  name: string;
  roles: Role[];
  sessionVersion: string;
}

// NFR-008 (Escalabilidad): estado in-process por instancia.
//
// `sessionVersions` guarda la versión de sesión vigente de cada usuario. Se usa
// para invalidar tokens cuando se desactiva una cuenta o se cambian sus roles.
//
// ⚠️ Limitación de multi-instancia: este Map vive en la memoria de CADA proceso.
// Si la API se ejecuta en varias instancias detrás de un balanceador:
//   - El usuario se desactiva en la instancia A → se borra su versión en A.
//   - La instancia B sigue teniendo la versión vieja → el token sigue siendo
//     válido en B hasta que expire (JWT_EXPIRES_IN, default 8h).
//
// Mitigación actual (aceptable para single-instance):
//   - El middleware `authenticate` consulta `resolveAccount` (BD) en cada petición,
//     que verifica `active` y `roles` vigentes. Un usuario desactivado recibe 401
//     aunque su token no haya expirado, porque la BD ya no lo encuentra activo.
//   - `sessionVersions` es una segunda capa de defensa: acelera el rechazo del
//     token sin consultar la BD en cada request.
//
// Ruta de migración a multi-instancia (cuando se necesite):
//   - Mover `sessionVersions` a un store compartido (Redis o tabla `sessions` en
//     PostgreSQL). Cada instancia lee/invalida la versión desde ahí.
//   - Alternativa más simple: añadir una columna `session_version` a `users` y
//     comparar el JWT contra la BD en cada request (sin cache in-process).
//     Coste: una consulta extra por request, pero garantiza consistencia.
//
// Ver docs/NFR-008-Scalability.md para el procedimiento de ampliación.
const sessionVersions = new Map<number, string>();

export function invalidateUserSessions(userId: number): void {
  sessionVersions.delete(userId);
}

export function signAccessToken(user: AuthUser): string {
  let sessionVersion = sessionVersions.get(user.id);

  if (!sessionVersion) {
    sessionVersion = randomUUID();
    sessionVersions.set(user.id, sessionVersion);
  }

  const payload: TokenPayload = {
    email: user.email,
    name: user.name,
    roles: user.roles,
    sessionVersion,
  };

  return jwt.sign(payload, env.jwtSecret, {
    subject: String(user.id),
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.jwtSecret);

  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload.');
  }

  const userId = Number(decoded.sub);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('Invalid token subject.');
  }

  const currentVersion = sessionVersions.get(userId);

  if (
    !currentVersion ||
    decoded.sessionVersion !== currentVersion
  ) {
    throw new Error('The session has been invalidated.');
  }

  const payload = decoded as jwt.JwtPayload & TokenPayload;

  return {
    id: userId,
    email: payload.email,
    name: payload.name,
    roles: payload.roles,
  };
}