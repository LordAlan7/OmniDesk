const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'
).replace(/\/$/, '')

const TOKEN_KEY = 'omnidesk.accessToken'

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

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

interface ApiResponse<T> {
  data: T
  meta?: {
    page: number
    limit: number
    total: number
  }
}

interface ErrorResponse {
  error?: {
    message?: string
    details?: unknown
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (options.body !== undefined && options.body !== null && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getToken()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    })
  } catch {
    throw new ApiError(
      'No se pudo conectar con el servidor. Comprueba que el backend esté ejecutándose.',
      0,
    )
  }

  const text = await response.text()
  let payload: unknown

  try {
    payload = text ? JSON.parse(text) : undefined
  } catch {
    throw new ApiError(
      'El servidor devolvió una respuesta que no es JSON.',
      response.status,
    )
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearToken()
    }

    const error = payload as ErrorResponse | undefined

    throw new ApiError(
      error?.error?.message || `Error del servidor (${response.status}).`,
      response.status,
      error?.error?.details,
    )
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('data' in payload)
  ) {
    throw new ApiError(
      'El servidor devolvió una respuesta inesperada.',
      response.status,
    )
  }

  return payload as ApiResponse<T>
}