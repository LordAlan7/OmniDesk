import { apiPage, ApiError as HttpError, setAccessToken, type RequestOptions } from '@/api/http'
import { readStoredToken, useSessionStore } from '@/stores/session'

export const getToken = readStoredToken
export function setToken(token: string): void {
  sessionStorage.setItem('omnidesk.token', token)
  setAccessToken(token)
}
export function clearToken(): void { useSessionStore().clear() }

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Compatibilidad para vistas existentes; el transporte y la sesión son únicos. */
export async function apiRequest<T>(path: string, options: RequestInit = {}) {
  let body: unknown = options.body ?? undefined
  if (typeof body === 'string') body = JSON.parse(body)
  try {
    return await apiPage<T>(path, {
      method: (options.method ?? 'GET') as RequestOptions['method'],
      headers: options.headers,
      body,
    })
  } catch (cause) {
    if (cause instanceof HttpError) {
      throw new ApiError(cause.message, cause.status, cause.details)
    }
    throw cause
  }
}
