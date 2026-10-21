<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError } from '../services/api'
import { clearSession, hasPermission } from '../services/session'
import { listOwnTickets, getOwnTicket, type TrackingTicket } from '../services/tracking'
const route = useRoute(), router = useRouter()
const rows = ref<TrackingTicket[]>([]), detail = ref<TrackingTicket | null>(null)
const status = ref(''), ticketId = ref(''), page = ref(1), total = ref(0)
const loading = ref(false), error = ref(''), consultedAt = ref('')
const pages = computed(() => Math.max(1, Math.ceil(total.value / 10)))
const labels: Record<string, string> = { Open: 'Abierto', Assigned: 'Asignado', 'In Progress': 'En progreso', Resolved: 'Resuelto', Closed: 'Cerrado' }
const date = (value: string) => new Date(value).toLocaleString('es-MX')
let sequence = 0
onBeforeUnmount(() => { sequence++ })
async function load() {
  const current = ++sequence
  rows.value = []; detail.value = null; total.value = 0
  error.value = ''; consultedAt.value = ''; loading.value = true
  try {
    if (route.params.id) {
      const id = Number(route.params.id)
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Identificador inválido.')
      const response = await getOwnTicket(id)
      if (current !== sequence) return
      detail.value = response
    } else {
      const response = await listOwnTickets(page.value, status.value, ticketId.value)
      if (current !== sequence) return
      rows.value = response.data; total.value = response.meta?.total ?? response.data.length
    }
    consultedAt.value = new Date().toLocaleString('es-MX')
  } catch (cause) {
    if (current !== sequence) return
    if (cause instanceof ApiError && cause.status === 401) {
      clearSession(); await router.replace('/login'); return
    }
    error.value = cause instanceof Error ? cause.message : 'No se pudo consultar el seguimiento.'
  } finally { if (current === sequence) loading.value = false }
}
function filter() { page.value = 1; void load() }
function reset() { status.value = ''; ticketId.value = ''; filter() }
function changePage(next: number) { page.value = next; void load() }
watch(() => route.params.id, () => { page.value = 1; void load() }, { immediate: true })
</script>
<template>
  <main class="tracking">
    <header><RouterLink to="/">Inicio</RouterLink><h1>Mis tickets</h1>
      <p>Consulta el estado y las actualizaciones de los tickets que enviaste.</p>
      <RouterLink v-if="hasPermission('tickets:create')" to="/tickets/new">Crear ticket</RouterLink>
      <button :disabled="loading" @click="load">Actualizar</button>
      <p v-if="consultedAt">Consultado: {{ consultedAt }}</p>
    </header>
    <form v-if="!route.params.id" @submit.prevent="filter">
      <label>Identificador <input v-model="ticketId" type="number" min="1" step="1" placeholder="Ej. 12" :disabled="loading" /></label>
      <label>Estado <select v-model="status" :disabled="loading"><option value="">Todos</option><option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option></select></label>
      <button :disabled="loading">Buscar</button><button type="button" :disabled="loading" @click="reset">Restablecer</button>
    </form>
    <p v-if="loading" role="status">Consultando tickets…</p>
    <section v-else-if="error" role="alert"><p>{{ error }}</p><button @click="load">Reintentar</button><RouterLink to="/my-tickets">Volver a mis tickets</RouterLink></section>
    <article v-else-if="detail">
      <RouterLink to="/my-tickets">Volver a mis tickets</RouterLink>
      <h2>#{{ detail.id }} · {{ detail.title }}</h2><p>Estado: {{ labels[detail.status] }}</p>
      <p class="description">{{ detail.description }}</p><p>Creado: {{ date(detail.createdAt) }}</p>
      <p>Tienda: {{ detail.storeLocation || 'Sin registrar' }}</p><p>Modelo: {{ detail.motorcycleModel || 'Sin registrar' }}</p>
      <p>Última actualización visible: {{ date(detail.lastVisibleUpdateAt) }}</p>
      <section v-if="detail.resolution"><h2>Resolución</h2><p class="description">{{ detail.resolution }}</p><p v-if="detail.resolvedAt">Resuelto: {{ date(detail.resolvedAt) }}</p></section>
      <p v-if="detail.closedAt">Cerrado: {{ date(detail.closedAt) }}</p>
      <h2>Actualizaciones</h2><p v-if="!detail.updates.length">Sin actualizaciones visibles.</p>
      <ol><li v-for="entry in detail.updates" :key="entry.id">
        <p>{{ entry.action === 'created' ? 'Ticket creado' : `Estado: ${labels[String(entry.from)]} → ${labels[String(entry.to)]}` }}</p>
        <time>{{ date(entry.createdAt) }}</time>
      </li></ol>
    </article>
    <section v-else>
      <p v-if="!rows.length">{{ status || ticketId ? 'No hay resultados para estos filtros.' : 'Aún no has enviado tickets.' }}</p>
      <div v-else class="table-wrap"><table><thead><tr><th>Ticket</th><th>Descripción</th><th>Estado</th><th>Creación</th><th>Última actualización visible</th></tr></thead>
        <tbody><tr v-for="item in rows" :key="item.id"><td><RouterLink :to="`/my-tickets/${item.id}`">#{{ item.id }} · {{ item.title }}</RouterLink></td><td>{{ item.description.slice(0, 100) }}</td><td>{{ labels[item.status] }}</td><td>{{ date(item.createdAt) }}</td><td>{{ date(item.lastVisibleUpdateAt) }}</td></tr></tbody></table></div>
      <footer>{{ total }} tickets · Página {{ page }} de {{ pages }}
        <button :disabled="page <= 1" @click="changePage(page - 1)">Anterior</button><button :disabled="page >= pages" @click="changePage(page + 1)">Siguiente</button>
      </footer>
    </section>
  </main>
</template>
<style scoped>
.tracking{max-width:1100px;margin:auto;padding:28px;color:#182338;font-family:Arial,sans-serif}header,form,article,section{padding:24px;margin-bottom:20px;background:#fff;border:1px solid #dce3ee;border-radius:14px}form,footer{display:flex;gap:14px;align-items:center;flex-wrap:wrap}label{display:grid;gap:8px}button,input,select{padding:10px;border:1px solid #b7c3d4;border-radius:8px;font:inherit}button{background:#2457d6;color:white;cursor:pointer;margin:6px}button:disabled{opacity:.5;cursor:default}a{color:#2457d6}table{width:100%;border-collapse:collapse;text-align:left}td,th{padding:14px;border-bottom:1px solid #dce3ee}.table-wrap{overflow:auto}.description{white-space:pre-wrap;overflow-wrap:anywhere}li{padding:8px}footer{margin-top:18px}[role=alert]{color:#a52121}:focus-visible{outline:2px solid #2457d6;outline-offset:3px}@media(max-width:600px){.tracking{padding:12px}}
</style>
