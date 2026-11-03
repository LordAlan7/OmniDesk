<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import { useNotificationsStore } from '@/stores/notifications'
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '@/services/notifications'

const router = useRouter()
const session = useSessionStore()
const notificationsStore = useNotificationsStore()

const notifications = ref<Notification[]>([])
const page = ref(1)
const limit = 10
const total = ref(0)
const loading = ref(false)
const error = ref('')
const success = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

async function load() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await listNotifications(page.value, limit)
    notifications.value = result.data
    total.value = result.meta?.total ?? result.data.length
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      return // el handler global redirige
    }
    error.value = cause instanceof Error ? cause.message : 'No se pudieron cargar las notificaciones.'
    notifications.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * Decisión 4: abrir la notificación la marca como leída automáticamente.
 * Navega al ticket referenciado.
 */
async function openNotification(notification: Notification) {
  if (!notification.read) {
    try {
      await markNotificationRead(notification.id)
      notification.read = true
      notification.readAt = new Date().toISOString()
      notificationsStore.decrementUnread(1)
    } catch {
      // Si falla el marcado, igual navegamos al ticket.
    }
  }

  if (notification.refEntity === 'ticket' && notification.refId !== null) {
    // El solicitante (Employee) ve el ticket en /my-tickets/:id; el staff en /tickets/:id.
    // Usamos can() para decidir. Ambas rutas existen en el router.
    const isStaff = session.can('tickets:read:all')
    const path = isStaff
      ? `/tickets/${notification.refId}`
      : `/my-tickets/${notification.refId}`
    await router.push(path)
  }
}

async function markRead(notification: Notification) {
  if (notification.read) return
  try {
    await markNotificationRead(notification.id)
    notification.read = true
    notification.readAt = new Date().toISOString()
    notificationsStore.decrementUnread(1)
    success.value = 'Notificación marcada como leída.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo marcar como leída.'
  }
}

async function markAll() {
  try {
    const updated = await markAllNotificationsRead()
    notifications.value.forEach((n) => {
      if (!n.read) {
        n.read = true
        n.readAt = new Date().toISOString()
      }
    })
    notificationsStore.decrementUnread(updated)
    success.value = `Se marcaron ${updated} notificaciones como leídas.`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudieron marcar todas como leídas.'
  }
}

function changePage(next: number) {
  if (loading.value || next < 1 || next > totalPages.value) return
  page.value = next
  void load()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <main class="notifications-page">
    <header>
      <h1>Notificaciones</h1>
      <p class="hint">
        Actualizaciones de tus tickets: asignaciones, cambios de prioridad, resolución, cierre y reapertura.
      </p>
      <button
        v-if="notificationsStore.hasUnread"
        class="btn-mark-all"
        :disabled="loading"
        @click="markAll"
      >
        Marcar todas como leídas
      </button>
    </header>

    <p v-if="loading" role="status">Cargando…</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="success" class="success" role="status">{{ success }}</p>

    <section v-if="!loading && !error">
      <p v-if="notifications.length === 0" class="empty">
        No tienes notificaciones.
      </p>

      <ul v-else class="notifications-list">
        <li
          v-for="notification in notifications"
          :key="notification.id"
          :class="['notification-item', { unread: !notification.read }]"
        >
          <button
            class="notification-button"
            :aria-label="`Abrir ticket #${notification.refId}`"
            @click="openNotification(notification)"
          >
            <span class="dot" v-if="!notification.read" aria-hidden="true"></span>
            <span class="message">{{ notification.message }}</span>
            <small class="date">{{ formatDate(notification.createdAt) }}</small>
          </button>

          <button
            v-if="!notification.read"
            class="btn-mark-read"
            :disabled="loading"
            @click.stop="markRead(notification)"
          >
            Marcar como leída
          </button>
        </li>
      </ul>

      <footer v-if="total > limit">
        <span>{{ total }} notificaciones · Página {{ page }} de {{ totalPages }}</span>
        <div class="pagination">
          <button :disabled="page <= 1" @click="changePage(page - 1)">Anterior</button>
          <button :disabled="page >= totalPages" @click="changePage(page + 1)">Siguiente</button>
        </div>
      </footer>
    </section>
  </main>
</template>

<style scoped>
.notifications-page {
  min-height: 100vh;
  padding: 32px;
  background: #f8f9ff;
  color: #182338;
  font-family: Arial, sans-serif;
  max-width: 800px;
  margin: 0 auto;
}

header { margin-bottom: 24px; }

h1 { margin: 0 0 8px; font-size: 24px; }

.hint { color: #5f6b7a; margin: 0 0 16px; }

.btn-mark-all {
  padding: 8px 16px;
  background: #2457d6;
  color: white;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.btn-mark-all:disabled { opacity: 0.5; cursor: default; }

.error, .success {
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.error { background: #fff0f0; color: #a52121; }

.success { background: #e7f6ed; color: #17663a; }

.empty { color: #5f6b7a; padding: 24px; text-align: center; }

.notifications-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  background: white;
  border: 1px solid #dce3ee;
  border-radius: 10px;
  overflow: hidden;
}

.notification-item.unread {
  border-left: 3px solid #2457d6;
  background: #f0f7ff;
}

.notification-button {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.notification-button:hover { background: #f8f9ff; }

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2457d6;
  flex-shrink: 0;
}

.message {
  flex: 1;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.notification-item.unread .message { font-weight: 600; }

.date {
  color: #5f6b7a;
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-mark-read {
  padding: 8px 12px;
  margin-right: 12px;
  background: white;
  color: #2457d6;
  border: 1px solid #2457d6;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  flex-shrink: 0;
}

.btn-mark-read:disabled { opacity: 0.5; cursor: default; }

footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  color: #5f6b7a;
}

.pagination { display: flex; gap: 8px; }

.pagination button {
  padding: 8px 14px;
  background: white;
  color: #2457d6;
  border: 1px solid #2457d6;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}

.pagination button:disabled { opacity: 0.5; cursor: default; }
</style>