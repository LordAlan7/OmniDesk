<script setup lang="ts">
import { hasPermission } from '../services/session'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError } from '../services/api'
import {
  clearSession,
  sessionUser,
} from '../services/session'
import {
  listTickets,
  type Ticket,
  type TicketStatus,
} from '../services/tickets'

const router = useRouter()
const tickets = ref<Ticket[]>([])
const status = ref<TicketStatus | ''>('')
const page = ref(1)
const limit = 10
const total = ref(0)
const loading = ref(false)
const error = ref('')

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / limit)),
)

const statuses: { value: TicketStatus; label: string }[] = [
  { value: 'Open', label: 'Abierto' },
  { value: 'Assigned', label: 'Asignado' },
  { value: 'In Progress', label: 'En progreso' },
  { value: 'Resolved', label: 'Resuelto' },
  { value: 'Closed', label: 'Cerrado' },
]

function statusLabel(value: TicketStatus): string {
  return statuses.find((item) => item.value === value)?.label ?? value
}

function technicianLabel(id: number | null): string {
  if (id === null) return 'Sin asignar'

  if (id === sessionUser.value?.id) {
    return `${sessionUser.value.name} (tú)`
  }

  return `Técnico #${id}`
}

async function loadTickets() {
  if (loading.value) return

  loading.value = true
  error.value = ''
  tickets.value = []
  total.value = 0

  try {
    const response = await listTickets(
      page.value,
      limit,
      status.value || undefined,
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
      await router.replace('/access-denied')
      return
    }

    error.value = cause instanceof Error
      ? cause.message
      : 'No se pudieron cargar los tickets.'
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

onMounted(() => {
  void loadTickets()
})
</script>

<template>
  <RouterLink v-if="hasPermission('tickets:create')" :to="{ name: 'create-ticket' }">Crear ticket</RouterLink>
  <main class="tickets-page">
    <header>
      <span class="brand">OmniDesk</span>
      <h1>Tickets de soporte</h1>
      <p>Consulta los tickets a los que tienes acceso y su responsable actual.</p>
    </header>

    <section class="card" :aria-busy="loading">
      <form class="filters" @submit.prevent="applyFilters">
        <label for="ticket-status">Estado</label>

        <select
          id="ticket-status"
          v-model="status"
          :disabled="loading"
        >
          <option value="">Todos los estados</option>
          <option
            v-for="item in statuses"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </option>
        </select>

        <button :disabled="loading">Consultar</button>
      </form>

      <p v-if="loading" role="status">Cargando tickets…</p>

      <div v-else-if="error" class="error" role="alert">
        <p>{{ error }}</p>
        <button @click="loadTickets">Reintentar</button>
      </div>

      <template v-else>
        <p v-if="tickets.length === 0">
          No hay tickets visibles con estos criterios.
        </p>

      
<!-- Listado de tickets -->
<div v-else class="tickets-results">

  <!-- Vista de escritorio -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col">Ticket</th>
          <th scope="col">Estado</th>
          <th scope="col">Técnico asignado</th>
          <th scope="col">Detalle</th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="ticket in tickets"
          :key="ticket.id"
        >
          <td>
            <strong>#{{ ticket.id }}</strong>
            {{ ticket.title }}
          </td>

          <td>
            <span class="ticket-status">
              {{ statusLabel(ticket.status) }}
            </span>
          </td>

          <td>
            {{
              'assignedTechnicianId' in ticket
                ? (
                    ticket.assignedTechnicianName ||
                    technicianLabel(ticket.assignedTechnicianId)
                  )
                : 'No compartido'
            }}
          </td>

          <td>
            <RouterLink :to="`/tickets/${ticket.id}`">
              Ver ticket
            </RouterLink>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Vista móvil -->
  <div class="mobile-tickets">
    <article
      v-for="ticket in tickets"
      :key="ticket.id"
      class="mobile-ticket-card"
    >
      <div class="mobile-ticket-header">
        <strong>Ticket #{{ ticket.id }}</strong>

        <span class="ticket-status">
          {{ statusLabel(ticket.status) }}
        </span>
      </div>

      <h2>{{ ticket.title }}</h2>

      <div class="mobile-ticket-info">
        <p>
          <strong>Técnico asignado</strong>
        </p>

        <p>
          {{
            'assignedTechnicianId' in ticket
              ? (
                  ticket.assignedTechnicianName ||
                  technicianLabel(ticket.assignedTechnicianId)
                )
              : 'No compartido'
          }}
        </p>
      </div>

      <RouterLink
        :to="`/tickets/${ticket.id}`"
        class="mobile-detail-button"
      >
        Ver detalles
      </RouterLink>
    </article>
  </div>
</div>


        <footer>
          <span>
            {{ total }} tickets · Página {{ page }} de {{ totalPages }}
          </span>
          <div class="pagination">
            <button
              :disabled="page <= 1"
              @click="changePage(page - 1)"
            >
              Anterior
            </button>
            <button
              :disabled="page >= totalPages"
              @click="changePage(page + 1)"
            >
              Siguiente
            </button>
          </div>
        </footer>
      </template>
    </section>
  </main>
</template>

<style scoped>
.tickets-page {
  min-height: 100vh;
  padding: 32px;
  background: #f8f9ff;
  color: #182338;
  font-family: Arial, sans-serif;
}
header, .card {
  max-width: 1200px;
  margin: 0 auto 24px;
}
.brand {
  color: #2457d6;
  font-size: 24px;
  font-weight: 700;
}
header p { color: #5f6b7a; line-height: 1.5; }
.card {
  padding: 24px;
  border: 1px solid #dce3ee;
  border-radius: 14px;
  background: white;
}
.filters, footer, .pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.filters { margin-bottom: 24px; }
footer { justify-content: space-between; margin-top: 24px; }
select, button {
  padding: 10px 14px;
  border-radius: 8px;
  font: inherit;
}
select { border: 1px solid #b7c3d4; background: white; }
button {
  border: 1px solid #2457d6;
  background: #2457d6;
  color: white;
  cursor: pointer;
}
button:disabled { opacity: .5; cursor: default; }
a { color: #2457d6; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 16px 12px; border-bottom: 1px solid #e4e9f1; }
th { background: #f8f9ff; color: #5f6b7a; }
.error { padding: 16px; background: #fff0f0; color: #a52121; }
button:focus-visible, select:focus-visible, a:focus-visible {
  outline: 2px solid #2457d6;
  outline-offset: 3px;
}
@media (max-width: 600px) {
  .tickets-page { padding: 16px; }
}

/* NFR-006: listado responsivo */

.tickets-page,
.tickets-page * {
  box-sizing: border-box;
}

.tickets-results {
  width: 100%;
  min-width: 0;
}

.mobile-tickets {
  display: none;
}

.ticket-status {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 20px;
  background: #edf1fb;
  color: #2457d6;
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 768px) {
  .tickets-page {
    padding: 16px;
  }

  .card {
    padding: 18px;
  }

  .table-wrap {
    display: none;
  }

  .mobile-tickets {
    display: grid;
    gap: 14px;
    grid-template-columns: minmax(0, 1fr);
  }

  .mobile-ticket-card {
    min-width: 0;
    padding: 18px;
    border: 1px solid #dce3ee;
    border-radius: 12px;
    background: #fff;
  }

  .mobile-ticket-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;
  }

  .mobile-ticket-card h2 {
    font-size: 18px;
    margin: 0 0 18px;
    overflow-wrap: anywhere;
  }

  .mobile-ticket-info {
    border-top: 1px solid #e4e9f1;
    padding-top: 12px;
    margin-bottom: 18px;
  }

  .mobile-ticket-info p {
    margin: 6px 0;
    overflow-wrap: anywhere;
  }

  .mobile-detail-button {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 10px 14px;
    background: #2457d6;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    text-decoration: none;
  }

  .filters {
    align-items: stretch;
  }

  .filters select,
  .filters button {
    min-height: 44px;
  }

  footer {
    align-items: flex-start;
  }
}

</style>
