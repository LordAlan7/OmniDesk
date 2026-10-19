import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, ApiError, setAccessToken } from '@/api/http'

export interface SessionUser {
  id: number
  name: string
  email: string
  roles: string[]
  permissions: string[]
}

interface LoginResponse {
  accessToken: string
  expiresAt: string
  user: SessionUser
}

const TOKEN_KEY = 'omnidesk.token'

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)
  /** true cuando ya se intentó recuperar la sesión al cargar/recargar la app. */
  const restored = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  /** ¿Tiene al menos uno de los permisos? Sin argumentos => true. Solo para UI: el servidor decide. */
  function can(...permissions: string[]): boolean {
    if (permissions.length === 0) return true
    const own = user.value?.permissions ?? []
    return permissions.some((p) => own.includes(p))
  }

  /** Limpia solo el estado local (también se usa cuando el servidor dice 401). */
  function clear(): void {
    user.value = null
    setAccessToken(null)
    sessionStorage.removeItem(TOKEN_KEY)
  }

  async function login(email: string, password: string): Promise<void> {
    const data = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    setAccessToken(data.accessToken)
    sessionStorage.setItem(TOKEN_KEY, data.accessToken)
    user.value = data.user
  }

  /** Al recargar: valida el token guardado con /auth/me (identidad y permisos vigentes). */
  async function restore(): Promise<void> {
    if (restored.value) return
    const saved = sessionStorage.getItem(TOKEN_KEY)
    if (saved) {
      setAccessToken(saved)
      try {
        user.value = await api<SessionUser>('/auth/me')
      } catch (e) {
        // 401 => sesión inválida: se descarta. Red/servidor caído => no se concede acceso.
        if (e instanceof ApiError && e.status === 401) clear()
        else user.value = null
      }
    }
    restored.value = true
  }

  /** Revoca la sesión en el servidor y limpia el estado local aunque el servidor no responda. */
  async function logout(): Promise<void> {
    try {
      await api<void>('/auth/logout', { method: 'POST' })
    } catch {
      /* se limpia igualmente el estado local */
    } finally {
      clear()
    }
  }

  return { user, restored, isAuthenticated, can, clear, login, restore, logout }
})
