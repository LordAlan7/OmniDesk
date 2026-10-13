import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AuthUser, Role } from '../types';

interface TokenPayload {
  email: string;
  name: string;
  roles: Role[];
}

export function signAccessToken(user: AuthUser): string {
  const payload: TokenPayload = { email: user.email, name: user.name, roles: user.roles };
  return jwt.sign(payload, env.jwtSecret, {
    subject: String(user.id),
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload & TokenPayload;
  return {
    id: Number(decoded.sub),
    email: decoded.email,
    name: decoded.name,
    roles: decoded.roles,
  };
}
