<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, ApiError } from '@/api/http'

interface UserRow { id: number; name: string; email: string; roles: string[]; active: boolean }
const users = ref<UserRow[]>([])
const error = ref('')

onMounted(async () => {
  try {
    users.value = await api<UserRow[]>('/users')
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return
    error.value = 'No se pudieron cargar los usuarios.'
  }
})
</script>

<template>
  <section class="card">
    <h1>Usuarios</h1>
    <p v-if="error" class="error">{{ error }}</p>
    <ul data-testid="user-list">
      <li v-for="u in users" :key="u.id">{{ u.name }} · {{ u.email }} · {{ u.roles.join(', ') }} · {{ u.active ? 'activo' : 'inactivo' }}</li>
    </ul>
  </section>
</template>
