/**
 * API pública del módulo de usuarios.
 */
export { usersRouter } from './users.routes';

export {
  verifyCredentials,
  findUserById,
  isActiveTechnician,
  listActiveTechnicians,
} from './users.service';

export {
  configurePendingTicketsChecker,
  withTechnicianLifecycleLock,
} from './users.lifecycle';

export type { PublicUser } from './users.types';