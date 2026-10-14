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

// Versiones de sesión para la implementación actual en memoria.
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