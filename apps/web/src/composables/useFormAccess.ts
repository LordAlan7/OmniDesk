import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/api/http'
import {
  clearSession,
  hasEveryPermission,
  hasPermission,
  refreshSession,
} from '../services/session'

export function useFormAccess(
  permissions: string[],
  isBusy: () => boolean,
  discard: () => void,
) {
  const router = useRouter()
  const authorized = ref(hasEveryPermission(...permissions))

  let disposed = false
  let checking = false
  let timer: ReturnType<typeof setInterval> | undefined

  async function deny(destination: string): Promise<false> {
    authorized.value = false
    discard()

    await router.replace(destination)
    return false
  }

  async function ensureAccess(): Promise<boolean> {
    if (disposed || checking) return false

    checking = true

    try {
      const user = await refreshSession()

      if (disposed) return false

      if (!user) {
        return await deny('/login')
      }

      if (!hasEveryPermission(...permissions)) {
        return await deny('/access-denied')
      }

      authorized.value = true
      return true
    } catch (cause) {
      if (disposed) return false

      if (cause instanceof ApiError && cause.status === 401) {
        clearSession()
        return await deny('/login')
      }

      return await deny('/access-denied?reason=unavailable')
    } finally {
      checking = false
    }
  }

  async function handleAccessError(cause: unknown): Promise<boolean> {
    if (!(cause instanceof ApiError)) return false

    if (cause.status === 401) {
      clearSession()
      await deny('/login')
      return true
    }

    if (cause.status === 403) {
      await deny('/access-denied')
      return true
    }

    return false
  }

  function revalidate() {
    if (
      !disposed &&
      !isBusy() &&
      document.visibilityState === 'visible'
    ) {
      void ensureAccess()
    }
  }

  onMounted(() => {
    revalidate()
    window.addEventListener('focus', revalidate)
    timer = setInterval(revalidate, 30000)
  })

  onUnmounted(() => {
    disposed = true
    window.removeEventListener('focus', revalidate)

    if (timer !== undefined) {
      clearInterval(timer)
    }

    discard()
  })

  return {
    authorized,
    ensureAccess,
    handleAccessError,
  }
}

/**
 * Paso 9: visibilidad de secciones por permiso (p. ej. INVENTORY_READ para
 * las secciones de inventario). A diferencia de useFormAccess —que protege
 * la vista completa y redirige a /access-denied—, este helper solo oculta o
 * muestra bloques de la interfaz según los permisos vigentes de la sesión;
 * nunca navega. `visible` es reactivo: reacciona al refresco de la sesión.
 */
export function usePermissionVisibility(permission: string) {
  const visible = computed(() => hasPermission(permission))

  return { visible }
}