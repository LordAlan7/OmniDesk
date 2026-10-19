/**
 * API pública del módulo de usuarios.
 */
export { usersRouter } from './users.routes';

export {
  verifyCredentials,
  findUserById,
  isActiveTechnician,
} from './users.service';

export {
  configurePendingTicketsChecker,
  withTechnicianLifecycleLock,
} from './users.lifecycle';

export type { PublicUser } from './users.types';