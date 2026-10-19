import type { AuthUser } from '../types';

/** Campos que nunca salen por la API (ni siquiera para Administrator). */
const NEVER_EXPOSE = new Set(['passwordHash', 'password', 'refreshToken', 'resetToken']);

/** Campos restringidos por rol. La clave es el campo; el valor son los roles autorizados. */
const RESTRICTED: Record<string, readonly string[]> = {
  internalNotes: ['Manager', 'Administrator'],
};

/**
 * Elimina campos internos de un objeto antes de enviarlo al cliente.
 * Se aplica en el service antes de devolver la respuesta.
 */
export function sanitizeForUser<T extends Record<string, unknown>>(
  entity: T,
  user: AuthUser,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (NEVER_EXPOSE.has(key)) continue;
    const allowed = RESTRICTED[key];
    if (allowed && !user.roles.some((r) => allowed.includes(r))) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}