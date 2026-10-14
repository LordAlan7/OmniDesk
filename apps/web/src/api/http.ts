export type ApiErrorKind = 'network' | 'server' | 'client'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly kind: ApiErrorKind,
    public readonly details?: { field?: string; message: string }[],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

let accessToken: string | null = null
let onUnauthorized: (() => void) | null = null

export const setAccessToken = (token: string | null): void => {
  accessToken = token
}

/** Se invoca cuando una petición PROTEGIDA responde 401 (sesión vencida o revocada). */
export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  onUnauthorized = handler
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** false en el login: ahí un 401 significa "credenciales incorrectas", no "sesión vencida". */
  auth?: boolean
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.', 'network')
  }

  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const e = payload?.error
    if (response.status === 401 && auth) onUnauthorized?.()
    throw new ApiError(
      response.status,
      e?.code ?? 'UNKNOWN_ERROR',
      e?.message ?? response.statusText,
      response.status >= 500 ? 'server' : 'client',
      e?.details,
    )
  }
  return payload.data as T
}
