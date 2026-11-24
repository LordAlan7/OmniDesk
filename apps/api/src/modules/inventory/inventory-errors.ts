import { AppError } from '../../shared/errors';

/** §8 del contrato: mapeo de la API de Inventario a AppError de soporte. */
export const InventoryErrors = {
  badRequest: (message = 'La solicitud a inventario es inválida.') =>
    new AppError(400, 'INVENTORY_BAD_REQUEST', message),
  /** 401/403 de la credencial de servicio: NUNCA cierra la sesión del usuario. */
  authFailed: () =>
    new AppError(
      502,
      'INVENTORY_AUTH_FAILED',
      'La credencial del servicio de inventario fue rechazada.',
    ),
  notFound: (what = 'El recurso') =>
    new AppError(404, 'INVENTORY_NOT_FOUND', `${what} no existe en inventario.`),
  rateLimited: () =>
    new AppError(
      503,
      'INVENTORY_RATE_LIMITED',
      'El servicio de inventario está saturado. Intenta más tarde.',
    ),
  unavailable: () =>
    new AppError(503, 'INVENTORY_UNAVAILABLE', 'El servicio de inventario no está disponible.'),
  contractMismatch: (detail: string) =>
    new AppError(
      502,
      'INVENTORY_CONTRACT_MISMATCH',
      `La respuesta de inventario no cumple el contrato: ${detail}`,
    ),
};

/** Traduce el status HTTP de inventario al AppError correspondiente (§8). */
export function mapInventoryStatus(status: number, message?: string): AppError {
  if (status === 400) return InventoryErrors.badRequest(message);
  if (status === 401 || status === 403) return InventoryErrors.authFailed();
  if (status === 404) return InventoryErrors.notFound();
  if (status === 429) return InventoryErrors.rateLimited();
  return InventoryErrors.unavailable();
}