<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { hasPermission } from './services/session'
</script>

<template>
  <nav class="main-nav" aria-label="Navegación principal">
    <span class="brand">OmniDesk</span>

    <RouterLink
      v-if="hasPermission('tickets:read')"
      to="/tickets"
    >
      Tickets
    </RouterLink>

    <RouterLink
      v-if="hasPermission('users:read:list')"
      to="/users"
    >
      Usuarios
    </RouterLink>

    <RouterLink
      v-if="hasPermission('knowledge:read')"
      to="/knowledge/documents"
    >
      Manuales y documentación
    </RouterLink>
  </nav>

  <RouterView />
</template>

<style>
body {
  margin: 0;
}

* {
  box-sizing: border-box;
}

.main-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  padding: 16px 24px;
  background: #edf1fb;
  font: 14px Arial, sans-serif;
}

.main-nav .brand {
  color: #182338;
  font-weight: 700;
}

.main-nav a {
  color: #2457d6;
  text-decoration: none;
}

.main-nav a.router-link-active {
  font-weight: 700;
  text-decoration: underline;
}

.main-nav a:focus-visible {
  outline: 2px solid #2457d6;
  outline-offset: 4px;
}
</style>