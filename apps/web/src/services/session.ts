import { readonly, ref } from 'vue'
import {
  ApiError,
  apiRequest,
  clearToken,
  getToken,
} from './api'

export interface SessionUser {
  id: number
  name: string
  email: string
  roles: string[]
  permissions: string[]
}

const currentUser = ref<SessionUser | null>(null)

export const sessionUser = readonly(currentUser)

export function hasPermission(permission: string): boolean {
  return currentUser.value?.permissions.includes(permission) ?? false
}

export function hasEveryPermission(...permissions: string[]): boolean {
  return permissions.every(hasPermission)
}

export function clearSession(): void {
  currentUser.value = null
  clearToken()
}

export async function refreshSession(): Promise<SessionUser | null> {
  const token = getToken()

  // Retirar permisos anteriores mientras se valida la sesión.
  currentUser.value = null

  if (!token) return null

  try {
    const response = await apiRequest<SessionUser>('/auth/me')

    // Evitar restaurar una sesión que cambió durante la solicitud.
    if (getToken() !== token) return null

    if (
      !response.data ||
      !Array.isArray(response.data.permissions)
    ) {
      throw new Error(
        'El servidor no devolvió los permisos de la cuenta.',
      )
    }

    currentUser.value = response.data
    return response.data
  } catch (cause) {
    if (getToken() === token) {
      currentUser.value = null

      if (cause instanceof ApiError && cause.status === 401) {
        clearToken()
        return null
      }
    }

    throw cause
  }
}