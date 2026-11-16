import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError } from '@/api/http'
import { getUnreadCount } from '@/services/notifications'

/**
 * FR-020: store de notificaciones.
 *
 * Mantiene el contador de no leídas para el badge del indicador en App.vue.
 * Se actualiza:
 * - Al montar App.vue (carga inicial).
 * - Cada 30 segundos (decisión 5: polling, no tiempo real).
 * - Al recibir foco la ventana (el usuario vuelve a la pestaña).
 * - Tras marcar una o todas como leídas (llamada explícita desde la vista).
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const unreadCount = ref(0)
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | undefined

  const hasUnread = computed(() => unreadCount.value > 0)

  async function refreshUnread(): Promise<void> {
    if (loading.value) return
    loading.value = true
    lastError.value = null
    try {
      unreadCount.value = await getUnreadCount()
    } catch (cause) {
      // No bloquear la UI si el contador falla; solo loggear.
      if (cause instanceof ApiError && cause.status === 401) {
        // Sesión vencida: el handler global de 401 ya redirige a login.
        return
      }
      lastError.value = cause instanceof Error ? cause.message : 'No se pudo consultar las notificaciones.'
    } finally {
      loading.value = false
    }
  }

  /** Llamada explícita desde la vista tras marcar como leída. */
  function decrementUnread(by = 1): void {
    unreadCount.value = Math.max(0, unreadCount.value - by)
  }

  /** Reinicia el contador (por ejemplo, tras cerrar sesión). */
  function reset(): void {
    unreadCount.value = 0
    lastError.value = null
  }

  function startPolling(intervalMs = 30000): void {
    stopPolling()
    pollTimer = setInterval(() => {
      void refreshUnread()
    }, intervalMs)
  }

  function stopPolling(): void {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  return {
    unreadCount,
    loading,
    lastError,
    hasUnread,
    refreshUnread,
    decrementUnread,
    reset,
    startPolling,
    stopPolling,
  }
})