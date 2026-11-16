import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

/**
 * Identificador de correlación de la petición en curso (NFR-009).
 * Relaciona los registros de historial y auditoría de una misma operación.
 */
export const currentCorrelationId = (): string | null => storage.getStore()?.requestId ?? null;
