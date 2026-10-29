<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useNotificationsStore } from '@/stores/notifications'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const notifications = useNotificationsStore()

async function onLogout() {
  notifications.stopPolling()
  notifications.reset()
  await session.logout()
  await router.push({ name: 'login' })
}

function handleVisibilityAndFocus() {
  if (document.visibilityState === 'visible') {
    void notifications.refreshUnread()
  }
}

onMounted(() => {
  watch(
    () => session.isAuthenticated,
    (isAuth) => {
      if (isAuth) {
        void notifications.refreshUnread()
        notifications.startPolling(30000)
        window.addEventListener('focus', handleVisibilityAndFocus)
      } else {
        notifications.stopPolling()
        notifications.reset()
        window.removeEventListener('focus', handleVisibilityAndFocus)
      }
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  notifications.stopPolling()
  window.removeEventListener('focus', handleVisibilityAndFocus)
})
</script>

<template>
  <header v-if="session.isAuthenticated && !route.meta.public" class="topbar">
    <strong>OmniDesk</strong>

    <RouterLink :to="{ name: 'dashboard' }">
      Inicio
    </RouterLink>

    <RouterLink
      v-if="session.can('tickets:read', 'tickets:read:own', 'tickets:read:all')"
      :to="{ name: 'tickets' }"
      data-testid="nav-tickets"
    >
      Tickets
    </RouterLink>

    <RouterLink
      v-if="session.can('users:manage')"
      :to="{ name: 'admin-users' }"
      data-testid="nav-admin"
    >
      Usuarios
    </RouterLink>

    <RouterLink v-if="session.can('users:read:list') && !session.can('users:manage')" :to="{ name: 'users' }">Usuarios</RouterLink>

    <!-- FR-020: indicador de notificaciones con badge -->
    <RouterLink
      :to="{ name: 'notifications' }"
      class="notifications-link"
      data-testid="nav-notifications"
      :aria-label="`Notificaciones${notifications.hasUnread ? `, ${notifications.unreadCount} sin leer` : ''}`"
    >
      <span class="bell" aria-hidden="true">🔔</span>
      <span
        v-if="notifications.hasUnread"
        class="badge"
        data-testid="notifications-badge"
      >
        {{ notifications.unreadCount > 99 ? '99+' : notifications.unreadCount }}
      </span>
    </RouterLink>

    <span class="spacer" />

    <span>{{ session.user?.name }}</span>

    <button type="button" data-testid="nav-logout" @click="onLogout">
      Cerrar sesión
    </button>
  </header>

  <div class="library-entry">
    <RouterLink to="/knowledge/documents">
      Manuales y documentación
    </RouterLink>
  </div>

  <main>
    <RouterView />
  </main>
</template>

<style>
.library-entry {
  padding: 10px 24px;
  font: 14px Arial, sans-serif;
  background: #edf1fb;
}

.library-entry a {
  color: #2457d6;
}

body {
  margin: 0;
}

* {
  box-sizing: border-box;
}

/* FR-020: indicador de notificaciones */
.notifications-link {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.notifications-link .bell {
  font-size: 18px;
}

.notifications-link .badge {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #ef4444;
  color: white;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
</style>