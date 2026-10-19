
<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

async function onLogout() {
  await session.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <header v-if="session.isAuthenticated && !route.meta.public" class="topbar">
    <strong>OmniDesk</strong>

    <RouterLink :to="{ name: 'dashboard' }">Inicio</RouterLink>

    <RouterLink
      v-if="session.can('tickets:read:own', 'tickets:read:all')"
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
</style>
