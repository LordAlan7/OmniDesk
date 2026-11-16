<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError } from '../services/api'
import { clearSession, hasPermission, sessionUser } from '../services/session'
import { listTickets, type Ticket, type TicketStatus } from '../services/tickets'

const router = useRouter()
const tickets = ref<Ticket[]>([])
const status = ref<TicketStatus | ''>('')
const overdue = ref<'' | 'true' | 'false'>('')
const page = ref(1)
const limit = 10
const total = ref(0)
const loading = ref(false)
const error = ref('')
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const statuses: { value: TicketStatus; label: string }[] = [
  { value: 'Open', label: 'Abierto' },
  { value: 'Assigned', label: 'Asignado' },
  { value: 'In Progress', label: 'En progreso' },
  { value: 'Resolved', label: 'Resuelto' },
  { value: 'Closed', label: 'Cerrado' },
]

function statusLabel(value: TicketStatus): string {
  return statuses.find(item => item.value === value)?.label ?? value
}

function formatDeadline(ticket: Ticket): string {
  if (!('dueDate' in ticket)) return 'No compartido'
  if (!ticket.dueDate) return 'Sin plazo definido'
  const parsed = new Date(ticket.dueDate)
  return Number.isNaN(parsed.getTime()) ? 'Fecha no disponible' : parsed.toLocaleString('es-MX')
}

function technicianLabel(ticket: Ticket): string {
  if (!('assignedTechnicianId' in ticket)) return 'No compartido'
  if (ticket.assignedTechnicianName) return ticket.assignedTechnicianName
  if (ticket.assignedTechnicianId === null) return 'Sin asignar'
  if (ticket.assignedTechnicianId === sessionUser.value?.id) return `${sessionUser.value.name} (tú)`
  return `Técnico #${ticket.assignedTechnicianId}`
}

async function loadTickets() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const response = await listTickets(
      page.value,
      limit,
      status.value || undefined,
      overdue.value === '' ? undefined : overdue.value === 'true',
    )
    tickets.value = response.data
    total.value = response.meta?.total ?? response.data.length
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      clearSession()
      await router.replace('/login')
      return
    }
    if (cause instanceof ApiError && cause.status === 403) {
      await router.replace('/forbidden')
      return
    }
    error.value = cause instanceof Error ? cause.message : 'No se pudieron cargar los tickets.'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  void loadTickets()
}

function changePage(next: number) {
  if (loading.value || next < 1 || next > totalPages.value) return
  page.value = next
  void loadTickets()
}

onMounted(() => { void loadTickets() })
</script>

<template>
  <main class="tickets-page">
    <header class="page-header">
      <div>
        <span class="brand">OmniDesk</span>
        <h1>Tickets de soporte</h1>
        <p>Consulta los tickets a los que tienes acceso y su responsable actual.</p>
      </div>
      <RouterLink v-if="hasPermission('tickets:create')" :to="{ name: 'create-ticket' }" class="create-link">Crear ticket</RouterLink>
    </header>

    <section class="card" :aria-busy="loading">
      <form class="filters" @submit.prevent="applyFilters">
        <label for="ticket-status">Estado</label>
        <select id="ticket-status" v-model="status" :disabled="loading">
          <option value="">Todos los estados</option>
          <option v-for="item in statuses" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
        <label for="ticket-overdue">Vencimiento</label>
        <select id="ticket-overdue" v-model="overdue" :disabled="loading">
          <option value="">Todos</option>
          <option value="true">Vencidos</option>
          <option value="false">No vencidos</option>
        </select>
        <button type="submit" :disabled="loading">Consultar</button>
      </form>

      <p v-if="loading" role="status">Cargando tickets...</p>
      <div v-else-if="error" class="error" role="alert">
        <p>{{ error }}</p>
        <button type="button" @click="loadTickets">Reintentar</button>
      </div>
      <template v-else>
        <p v-if="tickets.length === 0" role="status">No hay tickets visibles con estos criterios.</p>
        <div v-else class="tickets-results">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Plazo</th>
                  <th scope="col">Técnico asignado</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ticket in tickets" :key="ticket.id">
                  <td><strong>#{{ ticket.id }}</strong> {{ ticket.title }}</td>
                  <td><span class="ticket-status">{{ statusLabel(ticket.status) }}</span></td>
                  <td>
                    {{ formatDeadline(ticket) }}
                    <span v-if="ticket.isOverdue" class="overdue" data-testid="overdue-badge">Vencido</span>
                  </td>
                  <td>{{ technicianLabel(ticket) }}</td>
                  <td><RouterLink :to="`/tickets/${ticket.id}`">Ver ticket</RouterLink></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mobile-tickets">
            <article v-for="ticket in tickets" :key="ticket.id" class="mobile-ticket-card">
              <div class="mobile-ticket-header">
                <strong>Ticket #{{ ticket.id }}</strong>
                <span class="ticket-status">{{ statusLabel(ticket.status) }}</span>
              </div>
              <h2>{{ ticket.title }}</h2>
              <p><strong>Plazo:</strong> {{ formatDeadline(ticket) }} <span v-if="ticket.isOverdue" class="overdue" data-testid="overdue-badge">Vencido</span></p>
              <p><strong>Técnico asignado:</strong> {{ technicianLabel(ticket) }}</p>
              <RouterLink :to="`/tickets/${ticket.id}`" class="mobile-detail-button">Ver detalles</RouterLink>
            </article>
          </div>
        </div>
        <footer>
          <span>{{ total }} tickets · Página {{ page }} de {{ totalPages }}</span>
          <div class="pagination">
            <button type="button" :disabled="loading || page <= 1" @click="changePage(page - 1)">Anterior</button>
            <button type="button" :disabled="loading || page >= totalPages" @click="changePage(page + 1)">Siguiente</button>
          </div>
        </footer>
      </template>
    </section>
  </main>
</template>

<style scoped>
.tickets-page { min-height: 100vh; padding: 32px; background: #f8f9ff; color: #182338; font-family: Arial, sans-serif; }
.tickets-page, .tickets-page * { box-sizing: border-box; }
.page-header, .card { max-width: 1200px; margin: 0 auto 24px; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
.brand { color: #2457d6; font-size: 24px; font-weight: 700; }
header p { color: #5f6b7a; line-height: 1.5; }
.card { padding: 24px; border: 1px solid #dce3ee; border-radius: 14px; background: white; }
.filters, footer, .pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.filters { margin-bottom: 24px; }
footer { justify-content: space-between; margin-top: 24px; }
select, button { min-height: 44px; padding: 10px 14px; border-radius: 8px; font: inherit; }
select { border: 1px solid #b7c3d4; background: white; }
button, .create-link, .mobile-detail-button { border: 1px solid #2457d6; background: #2457d6; color: white; cursor: pointer; border-radius: 8px; }
.create-link { padding: 11px 14px; text-decoration: none; }
button:disabled { opacity: .5; cursor: default; }
a { color: #2457d6; }
.create-link, .mobile-detail-button { color: white; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 16px 12px; border-bottom: 1px solid #e4e9f1; }
th { background: #f8f9ff; color: #5f6b7a; }
.overdue { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px; background: #fff0f0; color: #a52121; font-size: 12px; font-weight: 700; }
.error { padding: 16px; background: #fff0f0; color: #a52121; }
button:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid #2457d6; outline-offset: 3px; }
.mobile-tickets { display: none; }
.ticket-status { display: inline-block; padding: 6px 10px; border-radius: 20px; background: #edf1fb; color: #2457d6; font-size: 12px; font-weight: 700; }
@media (max-width: 768px) {
  .tickets-page { padding: 16px; }
  .card { padding: 18px; }
  .table-wrap { display: none; }
  .mobile-tickets { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .mobile-ticket-card { min-width: 0; padding: 18px; border: 1px solid #dce3ee; border-radius: 12px; background: white; }
  .mobile-ticket-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .mobile-ticket-card h2 { font-size: 18px; margin: 12px 0; overflow-wrap: anywhere; }
  .mobile-ticket-card p { overflow-wrap: anywhere; }
  .mobile-detail-button { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; margin-top: 18px; padding: 10px 14px; font-weight: 600; text-decoration: none; }
  .filters { align-items: stretch; }
  .filters select, .filters button { min-height: 44px; }
  footer { align-items: flex-start; }
}
@media (max-width: 480px) { .filters { flex-direction: column; align-items: stretch; } }
</style>
