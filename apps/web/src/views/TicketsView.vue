<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, ApiError } from '@/api/http'

interface Ticket { id: number; title: string; status: string }
const tickets = ref<Ticket[]>([])
const error = ref('')

onMounted(async () => {
  try {
    tickets.value = await api<Ticket[]>('/tickets')
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return // el manejador global redirige al login
    error.value = 'No se pudieron cargar los tickets.'
  }
})
</script>

<template>
  <section class="card">
    <h1>Tickets</h1>
    <p v-if="error" class="error">{{ error }}</p>
    <ul data-testid="ticket-list">
      <li v-for="t in tickets" :key="t.id">#{{ t.id }} · {{ t.title }} ({{ t.status }})</li>
    </ul>
  </section>
</template>
