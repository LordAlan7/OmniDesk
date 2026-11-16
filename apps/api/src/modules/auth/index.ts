/**
 * Módulo AUTH (FR-001, NFR-001, NFR-002)
 * Maneja login / me / logout. El middleware reutilizable (authenticate, requireRole)
 * vive en shared/security para evitar la dependencia circular auth <-> users.
 */
export { authRouter } from './auth.routes';
