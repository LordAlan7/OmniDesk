<script setup lang="ts">
import { useSessionStore } from '@/stores/session'
const session = useSessionStore()
</script>

<template>
  <section class="card">
    <h1 data-testid="dashboard-title">Hola, {{ session.user?.name }}</h1>
    <p>Rol(es): <span data-testid="dashboard-roles">{{ session.user?.roles.join(', ') }}</span></p>
    <p v-if="session.can('tickets:read')"><RouterLink to="/my-tickets">Mis tickets</RouterLink></p>
    <p v-if="session.can('audit:read')"><RouterLink to="/audit">Auditoría</RouterLink></p>
    <details>
      <summary>Permisos vigentes</summary>
      <ul><li v-for="p in session.user?.permissions" :key="p">{{ p }}</li></ul>
    </details>
  </section>
</template>
