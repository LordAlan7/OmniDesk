export interface ErrorDetail {
  field?: string;
  message: string;
}

/** Error controlado: se traduce al formato { error: { code, message, details, requestId } }. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (details: ErrorDetail[], message = 'The request contains invalid fields.') =>
    new AppError(400, 'VALIDATION_ERROR', message, details),
  unauthorized: (message = 'Authentication is required.') =>
    new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'You do not have permission to perform this action.') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} was not found.`),
  conflict: (message: string) => new AppError(409, 'CONFLICT', message),
  invalidState: (message: string) => new AppError(409, 'INVALID_STATE', message),
  /**
   * AIR-001: fallo de un proveedor externo (OpenAI). No expone detalles del
   * proveedor al cliente; el mensaje es neutro. El incidente se audita por
   * separado como `ai.request_failed` (AIR-009).
   */
  badGateway: (message = 'External service is unavailable. Try again later.') =>
    new AppError(502, 'BAD_GATEWAY', message),
};