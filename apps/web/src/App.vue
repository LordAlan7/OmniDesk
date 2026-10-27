
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  RouterLink,
  RouterView,
  useRoute,
  useRouter,
} from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const menuOpen = ref(false)
const loggingOut = ref(false)

// NFR-006: el listado operativo de tickets se ofrece
// solamente al personal que tiene acceso general,
// o a técnicos que consultan sus propias asignaciones.
const canOpenTickets = computed(() =>
  session.can('tickets:read:all') ||
  (
    session.user?.roles.includes('Technician') === true &&
    session.can('tickets:read')
  ),
)

const canOpenMyTickets = computed(() =>
  session.can('tickets:read'),
)

const canManageUsers = computed(() =>
  session.can('users:manage'),
)

const canListUsers = computed(() =>
  session.can('users:read:list'),
)

// Cerrar el menú al cambiar de pantalla.
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

function closeMenu() {
  menuOpen.value = false
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

async function onLogout() {
  if (loggingOut.value) return

  loggingOut.value = true
  menuOpen.value = false

  try {
    await session.logout()
    await router.push({ name: 'login' })
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <header
    v-if="session.isAuthenticated && !route.meta.public"
    class="topbar"
  >
    <div class="topbar-inner">

      <RouterLink
        :to="{ name: 'dashboard' }"
        class="brand"
        @click="closeMenu"
      >
        OmniDesk
      </RouterLink>

      <!-- Menú para tabletas y celulares -->
      <button
        type="button"
        class="menu-toggle"
        :aria-expanded="menuOpen"
        aria-controls="main-navigation"
        :aria-label="
          menuOpen
            ? 'Cerrar menú de navegación'
            : 'Abrir menú de navegación'
        "
        @click="toggleMenu"
      >
        <span
          class="menu-icon"
          aria-hidden="true"
        >
          {{ menuOpen ? '✕' : '☰' }}
        </span>

        <span>Menú</span>
      </button>

      <nav
        id="main-navigation"
        class="navigation"
        :class="{ 'navigation-open': menuOpen }"
        aria-label="Navegación principal"
      >
        <div class="nav-links">

          <RouterLink
            :to="{ name: 'dashboard' }"
            class="nav-link"
            @click="closeMenu"
          >
            Inicio
          </RouterLink>

          <!-- Listado operativo -->
          <RouterLink
            v-if="canOpenTickets"
            :to="{ name: 'tickets' }"
            class="nav-link"
            data-testid="nav-tickets"
            @click="closeMenu"
          >
            Tickets
          </RouterLink>

          <!-- Seguimiento de solicitudes propias -->
          <RouterLink
            v-if="canOpenMyTickets"
            :to="{ name: 'my-tickets' }"
            class="nav-link"
            @click="closeMenu"
          >
            Mis tickets
          </RouterLink>

          <!-- Administración -->
          <RouterLink
            v-if="canManageUsers"
            :to="{ name: 'admin-users' }"
            class="nav-link"
            data-testid="nav-admin"
            @click="closeMenu"
          >
            Usuarios
          </RouterLink>

          <!-- Consulta de usuarios -->
          <RouterLink
            v-if="
              canListUsers &&
              !canManageUsers
            "
            :to="{ name: 'users' }"
            class="nav-link"
            @click="closeMenu"
          >
            Usuarios
          </RouterLink>

          <RouterLink
            v-if="session.can('knowledge:read')"
            :to="{ name: 'documents' }"
            class="nav-link"
            @click="closeMenu"
          >
            Manuales y documentación
          </RouterLink>

        </div>

        <div class="nav-account">
          <div class="user-info">
            <span class="user-label">
              Sesión iniciada como
            </span>

            <span class="user-name">
              {{ session.user?.name }}
            </span>
          </div>

          <button
            type="button"
            class="logout-button"
            data-testid="nav-logout"
            :disabled="loggingOut"
            @click="onLogout"
          >
            {{
              loggingOut
                ? 'Cerrando...'
                : 'Cerrar sesión'
            }}
          </button>
        </div>
      </nav>
    </div>
  </header>

  <main class="app-content">
    <RouterView />
  </main>
</template>

<style>
/* Estilos generales */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  background: #f3f4f6;
  font-family: 'Inter', Arial, sans-serif;
}

button,
input,
select,
textarea {
  font: inherit;
}

.app-content {
  min-width: 0;
}

/* Barra superior */
.topbar {
  width: 100%;
  background: #111827;
  color: #ffffff;
  position: relative;
  z-index: 100;
}

.topbar-inner {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0 32px;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
}

.brand {
  color: #ffffff;
  text-decoration: none;
  font-size: 19px;
  font-weight: 800;
  white-space: nowrap;
}

.brand:hover {
  color: #c7d2fe;
}

/* Navegación de escritorio */
.navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 20px;
}

.nav-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-right: auto;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  padding: 10px 12px;
  color: #e5e7eb;
  text-decoration: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.nav-link:hover {
  background: #1f2937;
  color: #ffffff;
}

.nav-link.router-link-active {
  background: #1e40af;
  color: #ffffff;
}

/* Usuario */
.nav-account {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto;
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  min-width: 0;
}

.user-label {
  color: #9ca3af;
  font-size: 11px;
}

.user-name {
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.logout-button {
  min-height: 40px;
  padding: 9px 14px;
  border: 1px solid #64748b;
  border-radius: 8px;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  white-space: nowrap;
}

.logout-button:hover:not(:disabled) {
  background: #374151;
}

.logout-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Botón de menú móvil */
.menu-toggle {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid #64748b;
  border-radius: 8px;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  font-weight: 600;
}

.menu-icon {
  font-size: 20px;
  line-height: 1;
}

/* Accesibilidad */
.topbar a:focus-visible,
.topbar button:focus-visible {
  outline: 3px solid #93c5fd;
  outline-offset: 3px;
}

/* Tabletas y celulares */
@media (max-width: 1024px) {
  .topbar-inner {
    min-height: 64px;
    width: 100%;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .brand {
    margin-right: auto;
  }

  .menu-toggle {
    display: inline-flex;
    min-height: 44px;
    margin-left: auto;
  }

  .navigation {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #111827;
    border-top: 1px solid #374151;
    padding: 16px 18px 22px;
    flex-direction: column;
    align-items: stretch;
    gap: 18px;
    max-height: calc(100dvh - 64px);
    overflow-y: auto;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
  }

  .navigation.navigation-open {
    display: flex;
  }

  .nav-links {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    margin-right: 0;
  }

  .nav-link {
    display: flex;
    width: 100%;
    min-height: 44px;
    padding: 12px 14px;
  }

  .nav-account {
    width: 100%;
    margin-left: 0;
    padding-top: 16px;
    border-top: 1px solid #374151;
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }

  .user-info {
    align-items: flex-start;
  }

  .user-name {
    font-size: 14px;
  }

  .logout-button {
    width: 100%;
    min-height: 44px;
  }
}

@media (max-width: 480px) {
  .topbar-inner {
    padding: 10px 14px;
  }

  .brand {
    font-size: 18px;
  }

  .menu-toggle {
    padding: 8px 12px;
  }
}
</style>
