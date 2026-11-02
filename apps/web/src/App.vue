
<script setup lang="ts">
import {
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'

import {
  RouterLink,
  RouterView,
  useRoute,
  useRouter,
} from 'vue-router'

import { useSessionStore } from '@/stores/session'
import { useNotificationsStore } from '@/stores/notifications'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const notifications = useNotificationsStore()

// NFR-006: menú desplegable en dispositivos móviles.
const menuOpen = ref(false)

function closeMenu() {
  menuOpen.value = false
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

// Cerrar el menú al cambiar de página.
watch(
  () => route.fullPath,
  () => {
    closeMenu()
  },
)

async function onLogout() {
  closeMenu()

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

        window.addEventListener(
          'focus',
          handleVisibilityAndFocus,
        )
      } else {
        closeMenu()
        notifications.stopPolling()
        notifications.reset()

        window.removeEventListener(
          'focus',
          handleVisibilityAndFocus,
        )
      }
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  notifications.stopPolling()

  window.removeEventListener(
    'focus',
    handleVisibilityAndFocus,
  )
})
</script>

<template>
  <header
    v-if="session.isAuthenticated && !route.meta.public"
    class="topbar"
    @keydown.esc="closeMenu"
  >
    <div class="topbar-inner">

      <!-- Logo de OmniDesk -->
      <RouterLink
        :to="{ name: 'dashboard' }"
        class="brand"
        @click="closeMenu"
      >
        OmniDesk
      </RouterLink>

      <!-- Botón de menú para celulares -->
      <button
        type="button"
        class="menu-toggle"
        :aria-expanded="menuOpen"
        :aria-label="
          menuOpen ? 'Cerrar menú' : 'Abrir menú'
        "
        aria-controls="main-navigation"
        @click="toggleMenu"
      >
        <span aria-hidden="true">
          {{ menuOpen ? '✕' : '☰' }}
        </span>

        <span>Menú</span>
      </button>

      <!-- Navegación principal -->
      <nav
        id="main-navigation"
        class="navigation"
        :class="{ 'navigation-open': menuOpen }"
        aria-label="Navegación principal"
      >
        <div class="navigation-links">

          <RouterLink
            :to="{ name: 'dashboard' }"
            @click="closeMenu"
          >
            Inicio
          </RouterLink>

          <RouterLink
            v-if="
              session.can(
                'tickets:read',
                'tickets:read:own',
                'tickets:read:all'
              )
            "
            :to="{ name: 'tickets' }"
            data-testid="nav-tickets"
            @click="closeMenu"
          >
            Tickets
          </RouterLink>

          <!-- Administración de usuarios -->
          <RouterLink
            v-if="session.can('users:create')"
            :to="{ name: 'admin-users' }"
            data-testid="nav-admin"
            @click="closeMenu"
          >
            Usuarios
          </RouterLink>

          <!-- Consulta de usuarios sin gestión -->
          <RouterLink
            v-if="
              session.can('users:read:list') &&
              !session.can('users:create')
            "
            :to="{ name: 'users' }"
            @click="closeMenu"
          >
            Usuarios
          </RouterLink>

          <!-- FR-020: notificaciones -->
          <RouterLink
            :to="{ name: 'notifications' }"
            class="notifications-link"
            data-testid="nav-notifications"
            :aria-label="
              `Notificaciones${
                notifications.hasUnread
                  ? `, ${notifications.unreadCount} sin leer`
                  : ''
              }`
            "
            @click="closeMenu"
          >
            <span class="bell" aria-hidden="true">
              🔔
            </span>

            <span
              v-if="notifications.hasUnread"
              class="badge"
              data-testid="notifications-badge"
            >
              {{
                notifications.unreadCount > 99
                  ? '99+'
                  : notifications.unreadCount
              }}
            </span>
          </RouterLink>
        </div>

        <!-- Cuenta y cierre de sesión -->
        <div class="session-actions">
          <span class="session-name">
            {{ session.user?.name }}
          </span>

          <button
            type="button"
            class="logout-button"
            data-testid="nav-logout"
            @click="onLogout"
          >
            Cerrar sesión
          </button>
        </div>
      </nav>
    </div>
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
* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

/* Barra principal */
.topbar {
  position: relative;
  z-index: 100;
  background: #111827;
  color: #ffffff;
}

.topbar-inner {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 64px;
  padding: 12px 20px;
  gap: 22px;
}

/* Logo */
.brand {
  color: #ffffff;
  text-decoration: none;
  font-weight: 700;
  font-size: 18px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Navegación de computadora */
.navigation {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 18px;
}

.navigation-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
}

.navigation-links a {
  color: #f8fafc;
  text-decoration: none;
}

.navigation-links a:hover,
.navigation-links a.router-link-active {
  color: #93c5fd;
}

/* Cuenta de usuario */
.session-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
}

.session-name {
  white-space: nowrap;
}

.logout-button {
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: #f3f4f6;
  color: #111827;
  padding: 9px 14px;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

/* Botón desplegable: oculto en computadora */
.menu-toggle {
  display: none;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #4b5563;
  border-radius: 8px;
  padding: 10px 14px;
  background: #1f2937;
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.menu-toggle span:first-child {
  font-size: 21px;
  line-height: 1;
}

/* Notificaciones */
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

/* Accesibilidad */
.topbar a:focus-visible,
.topbar button:focus-visible {
  outline: 3px solid #93c5fd;
  outline-offset: 3px;
}

/* Documentación */
.library-entry {
  padding: 10px 24px;
  font: 14px Arial, sans-serif;
  background: #edf1fb;
}

.library-entry a {
  color: #2457d6;
}

/* NFR-006: menú desplegable móvil */
@media (max-width: 700px) {

  .topbar-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    min-height: 64px;
    padding: 10px 16px;
    gap: 12px;
  }

  .brand {
    margin-right: auto;
  }

  .menu-toggle {
    display: inline-flex;
    margin-left: auto;
    flex-shrink: 0;
    min-height: 44px;
  }

  /* Oculto hasta pulsar Menú */
  .navigation {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 101;

    background: #111827;
    border-top: 1px solid #374151;
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.2);

    max-height: calc(100dvh - 64px);
    overflow-y: auto;
  }

  /* Menú abierto */
  .navigation.navigation-open {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 18px;
    padding: 16px 18px 22px;
  }

  .navigation-links {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    gap: 6px;
  }

  .navigation-links a {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 12px 14px;
    border-radius: 8px;
  }

  .navigation-links a:hover {
    background: #1f2937;
  }

  /* Datos de la cuenta al final del menú */
  .session-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    width: 100%;
    margin-left: 0;
    padding-top: 16px;
    border-top: 1px solid #374151;
  }

  .session-name {
    padding: 0 14px;
    white-space: normal;
  }

  .logout-button {
    width: 100%;
    min-height: 44px;
  }

  .library-entry {
    padding: 10px 16px;
  }
}
</style>
