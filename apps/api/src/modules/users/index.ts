/**
 * Módulo USERS (FR-002 - User & Technician Management)
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { usersRouter } from './users.routes';
export { verifyCredentials, findUserById, isActiveTechnician } from './users.service';
export type { PublicUser } from './users.types';
