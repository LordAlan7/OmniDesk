import { readonly, ref } from 'vue'
import { readStoredToken, useSessionStore, type SessionUser } from '@/stores/session'
import { api, ApiError, setAccessToken } from '@/api/http'

export type { SessionUser }

/**
 * Adaptador sobre el store de sesión (Pinia): las vistas de usuarios y el resto
 * de la app comparten una única sesión y un único token (`omnidesk.token`).
 */
const currentUser = ref<SessionUser | null>(null)

export const sessionUser = readonly(currentUser)

export function hasPermission(permission: string): boolean {
  return useSessionStore().user?.permissions.includes(permission) ?? false
}

export function hasEveryPermission(...permissions: string[]): boolean {
  return permissions.every(hasPermission)
}

export function clearSession(): void {
  currentUser.value = null
  useSessionStore().clear()
}

export async function refreshSession(): Promise<SessionUser | null> {
  const session = useSessionStore()
  const token = readStoredToken()

  // Retirar permisos anteriores mientras se valida la sesión.
  session.user = null
  currentUser.value = null

  if (!token) return null
  setAccessToken(token)

  try {
    const me = await api<SessionUser>('/auth/me')

    // Evitar restaurar una sesión que cambió durante la solicitud.
    if (readStoredToken() !== token) return null

    if (!me || !Array.isArray(me.permissions)) {
      throw new Error('El servidor no devolvió los permisos de la cuenta.')
    }

    session.user = me
    currentUser.value = me
    return me
  } catch (cause) {
    if (readStoredToken() === token) {
      session.user = null
      currentUser.value = null

      if (cause instanceof ApiError && cause.status === 401) {
        session.clear()
        return null
      }
    }

    throw cause
  }
}
