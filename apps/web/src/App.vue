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
    <!-- Solo se muestran las opciones permitidas. El backend valida igualmente cada petición. -->
    <RouterLink v-if="session.can('tickets:read:own', 'tickets:read:all')" :to="{ name: 'tickets' }" data-testid="nav-tickets">Tickets</RouterLink>
    <RouterLink v-if="session.can('users:read:list')" :to="{ name: 'users' }" data-testid="nav-admin">Usuarios</RouterLink>
    <span class="spacer" />
    <span>{{ session.user?.name }}</span>
    <button type="button" data-testid="nav-logout" @click="onLogout">Cerrar sesión</button>
  </header>
  <main>
    <RouterView />
  </main>
</template>
