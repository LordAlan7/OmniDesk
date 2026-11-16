
<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onBeforeUnmount,
} from 'vue'
import {
  RouterLink,
  useRoute,
  useRouter,
} from 'vue-router'
import { ApiError } from '../services/api'
import {
  clearSession,
  hasPermission,
} from '../services/session'
import {
  listOwnTickets,
  getOwnTicket,
  type TrackingTicket,
} from '../services/tracking'

const route = useRoute()
const router = useRouter()

const rows = ref<TrackingTicket[]>([])
const detail = ref<TrackingTicket | null>(null)

const status = ref('')
const ticketId = ref('')
const page = ref(1)
const total = ref(0)

const loading = ref(false)
const error = ref('')
const consultedAt = ref('')

const pages = computed(() =>
  Math.max(1, Math.ceil(total.value / 10)),
)

const isDetail = computed(() => Boolean(route.params.id))

const labels: Record<string, string> = {
  Open: 'Abierto',
  Assigned: 'Asignado',
  'In Progress': 'En progreso',
  Resolved: 'Resuelto',
  Closed: 'Cerrado',
}

const statusClasses: Record<string, string> = {
  Open: 'status-open',
  Assigned: 'status-assigned',
  'In Progress': 'status-progress',
  Resolved: 'status-resolved',
  Closed: 'status-closed',
}

function statusLabel(value: string): string {
  return labels[value] ?? value
}

function statusClass(value: string): string {
  return statusClasses[value] ?? 'status-default'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin registrar'

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return 'Fecha no disponible'
  }

  return parsed.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function descriptionPreview(value: string): string {
  if (value.length <= 110) return value
  return `${value.slice(0, 110)}…`
}

// Mantener el contexto al consultar el detalle
const listQuery = computed(() => {
  const query: Record<string, string> = {}

  if (status.value) query.status = status.value
  if (ticketId.value) query.ticketId = ticketId.value
  if (page.value > 1) query.page = String(page.value)

  return query
})

function detailLocation(id: number) {
  return {
    name: 'my-ticket-detail',
    params: { id },
    query: listQuery.value,
  }
}

let sequence = 0

onBeforeUnmount(() => {
  sequence++
})

async function load() {
  const current = ++sequence

  error.value = ''
  consultedAt.value = ''
  loading.value = true

  rows.value = []
  detail.value = null
  total.value = 0

  try {
    if (isDetail.value) {
      const id = Number(route.params.id)

      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error('El identificador del ticket no es válido.')
      }

      const response = await getOwnTicket(id)

      if (current !== sequence) return

      detail.value = response
    } else {
      const response = await listOwnTickets(
        page.value,
        status.value,
        ticketId.value,
      )

      if (current !== sequence) return

      rows.value = response.data
      total.value =
        response.meta?.total ?? response.data.length
    }

    consultedAt.value = new Date().toLocaleString('es-MX')
  } catch (cause) {
    if (current !== sequence) return

    if (cause instanceof ApiError && cause.status === 401) {
      clearSession()

      await router.replace({
        name: 'login',
        query: { redirect: route.fullPath },
      })

      return
    }

    error.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo consultar el seguimiento de tickets.'
  } finally {
    if (current === sequence) {
      loading.value = false
    }
  }
}

function filter() {
  page.value = 1

  void router.replace({
    name: 'my-tickets',
    query: listQuery.value,
  }).then(() => load())
}

function reset() {
  status.value = ''
  ticketId.value = ''
  page.value = 1

  void router.replace({
    name: 'my-tickets',
    query: {},
  }).then(() => load())
}

function changePage(next: number) {
  if (next < 1 || next > pages.value || loading.value) return

  page.value = next

  void router.replace({
    name: 'my-tickets',
    query: listQuery.value,
  }).then(() => load())
}

function restoreFilters() {
  status.value =
    typeof route.query.status === 'string'
      ? route.query.status
      : ''

  ticketId.value =
    typeof route.query.ticketId === 'string'
      ? route.query.ticketId
      : ''

  const requestedPage = Number(route.query.page ?? 1)

  page.value =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1
}

const backLocation = computed(() => ({
  name: 'my-tickets',
  query: listQuery.value,
}))

watch(
  () => route.fullPath,
  () => {
    restoreFilters()
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <main class="tracking">

    <!-- Encabezado -->
    <header class="panel tracking-header">
      <RouterLink to="/" class="back-link">
        ← Inicio
      </RouterLink>

      <h1>
        {{ isDetail ? 'Detalle del ticket' : 'Mis tickets' }}
      </h1>

      <p class="subtitle">
        {{
          isDetail
            ? 'Consulta el estado y las actualizaciones de tu solicitud.'
            : 'Consulta el estado y las actualizaciones de los tickets que enviaste.'
        }}
      </p>

      <div class="header-actions">
        <RouterLink
          v-if="hasPermission('tickets:create')"
          to="/tickets/new"
          class="btn btn-secondary"
        >
          Crear ticket
        </RouterLink>

        <button
          type="button"
          class="btn btn-primary"
          :disabled="loading"
          @click="load"
        >
          {{ loading ? 'Actualizando...' : 'Actualizar' }}
        </button>
      </div>

      <p
        v-if="consultedAt"
        class="consulted-date"
      >
        Última consulta: {{ consultedAt }}
      </p>
    </header>

    <!-- Filtros -->
    <form
      v-if="!isDetail"
      class="panel filters"
      aria-label="Filtros de tickets"
      @submit.prevent="filter"
    >
      <div class="filter-group">
        <label for="ticket-filter">
          Identificador del ticket
        </label>

        <input
          id="ticket-filter"
          v-model="ticketId"
          type="number"
          min="1"
          step="1"
          placeholder="Ej. 5"
          :disabled="loading"
        />
      </div>

      <div class="filter-group">
        <label for="status-filter">
          Estado
        </label>

        <select
          id="status-filter"
          v-model="status"
          :disabled="loading"
        >
          <option value="">Todos los estados</option>

          <option
            v-for="(label, value) in labels"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </select>
      </div>

      <div class="filter-actions">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="loading"
        >
          Buscar
        </button>

        <button
          type="button"
          class="btn btn-secondary"
          :disabled="loading"
          @click="reset"
        >
          Restablecer
        </button>
      </div>
    </form>

    <!-- Estado de carga -->
    <section
      v-if="loading"
      class="panel feedback-panel"
      role="status"
      aria-live="polite"
    >
      <p>Consultando la información de tus tickets...</p>
    </section>

    <!-- Error -->
    <section
      v-else-if="error"
      class="panel feedback-panel error-panel"
      role="alert"
    >
      <h2>No se pudo completar la consulta</h2>
      <p>{{ error }}</p>

      <div class="header-actions">
        <button
          type="button"
          class="btn btn-primary"
          @click="load"
        >
          Reintentar
        </button>

        <RouterLink
          :to="backLocation"
          class="btn btn-secondary"
        >
          Volver a mis tickets
        </RouterLink>
      </div>
    </section>

    <!-- Detalle del ticket -->
    <article
      v-else-if="detail"
      class="panel detail-panel"
    >
      <RouterLink
        :to="backLocation"
        class="back-link"
      >
        ← Volver a mis tickets
      </RouterLink>

      <div class="detail-heading">
        <div>
          <p class="ticket-number">
            Ticket #{{ detail.id }}
          </p>

          <h2>{{ detail.title }}</h2>
        </div>

        <span
          class="status-badge"
          :class="statusClass(detail.status)"
        >
          {{ statusLabel(detail.status) }}
        </span>
      </div>

      <section class="detail-section">
        <h3>Información del ticket</h3>

        <dl class="detail-grid">
          <div>
            <dt>Fecha de creación</dt>
            <dd>{{ formatDate(detail.createdAt) }}</dd>
          </div>

          <div>
            <dt>Última actualización visible</dt>
            <dd>{{ formatDate(detail.lastVisibleUpdateAt) }}</dd>
          </div>

          <div>
            <dt>Tienda o ubicación</dt>
            <dd>
              {{ detail.storeLocation || 'Sin registrar' }}
            </dd>
          </div>

          <div>
            <dt>Modelo de motocicleta</dt>
            <dd>
              {{ detail.motorcycleModel || 'Sin registrar' }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>Descripción del problema</h3>
        <p class="description">
          {{ detail.description }}
        </p>
      </section>

      <!-- Resolución -->
      <section
        v-if="detail.resolution"
        class="detail-section"
      >
        <h3>Resolución</h3>

        <p class="description">
          {{ detail.resolution }}
        </p>

        <p v-if="detail.resolvedAt">
          Fecha de resolución:
          {{ formatDate(detail.resolvedAt) }}
        </p>
      </section>

      <p v-if="detail.closedAt" class="closed-date">
        Cerrado: {{ formatDate(detail.closedAt) }}
      </p>

      <!-- Historial -->
      <section class="detail-section">
        <h3>Actualizaciones del ticket</h3>

        <p
          v-if="!detail.updates.length"
          class="empty-description"
        >
          Este ticket todavía no tiene actualizaciones
          adicionales visibles.
        </p>

        <ol v-else class="timeline">
          <li
            v-for="entry in detail.updates"
            :key="entry.id"
            class="timeline-item"
          >
            <p class="timeline-action">
              {{
                entry.action === 'created'
                  ? 'Ticket creado'
                  : `Estado: ${statusLabel(String(entry.from))} → ${statusLabel(String(entry.to))}`
              }}
            </p>

            <time class="timeline-date">
              {{ formatDate(entry.createdAt) }}
            </time>
          </li>
        </ol>
      </section>
    </article>

    <!-- Listado -->
    <section v-else class="panel list-panel">
      <template v-if="rows.length === 0">
        <div class="empty-state" role="status">
          <h2>
            {{
              status || ticketId
                ? 'No se encontraron resultados'
                : 'Todavía no tienes tickets registrados'
            }}
          </h2>

          <p>
            {{
              status || ticketId
                ? 'Prueba modificando los filtros o restableciendo la búsqueda.'
                : 'Cuando crees una solicitud de soporte, aparecerá aquí.'
            }}
          </p>

          <RouterLink
            v-if="!status && !ticketId && hasPermission('tickets:create')"
            to="/tickets/new"
            class="btn btn-primary"
          >
            Crear mi primer ticket
          </RouterLink>
        </div>
      </template>

      <template v-else>
        <h2 class="section-title">
          Solicitudes registradas
        </h2>

        
<!-- Tarjetas para dispositivos móviles -->
<div class="mobile-ticket-list">
  <article
    v-for="item in rows"
    :key="item.id"
    class="mobile-ticket-card"
  >
    <div class="mobile-card-header">
      <span class="ticket-number">
        Ticket #{{ item.id }}
      </span>

      <span
        class="status-badge"
        :class="statusClass(item.status)"
      >
        {{ statusLabel(item.status) }}
      </span>
    </div>

    <h3>{{ item.title }}</h3>

    <p class="mobile-description">
      {{ descriptionPreview(item.description) }}
    </p>

    <dl class="mobile-ticket-info">
      <div>
        <dt>Fecha de creación</dt>
        <dd>{{ formatDate(item.createdAt) }}</dd>
      </div>

      <div>
        <dt>Última actualización</dt>
        <dd>{{ formatDate(item.lastVisibleUpdateAt) }}</dd>
      </div>
    </dl>

    <RouterLink
      :to="detailLocation(item.id)"
      class="btn btn-primary mobile-detail-link"
    >
      Ver detalles
    </RouterLink>
  </article>
</div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Ticket</th>
                <th scope="col">Descripción</th>
                <th scope="col">Estado</th>
                <th scope="col">Creación</th>
                <th scope="col">Última actualización</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="item in rows"
                :key="item.id"
              >
                <td class="ticket-cell">
                  <RouterLink
                    :to="detailLocation(item.id)"
                    class="ticket-link"
                  >
                    #{{ item.id }} · {{ item.title }}
                  </RouterLink>
                </td>

                <td class="description-cell">
                  {{ descriptionPreview(item.description) }}
                </td>

                <td>
                  <span
                    class="status-badge"
                    :class="statusClass(item.status)"
                  >
                    {{ statusLabel(item.status) }}
                  </span>
                </td>

                <td class="date-cell">
                  {{ formatDate(item.createdAt) }}
                </td>

                <td class="date-cell">
                  {{ formatDate(item.lastVisibleUpdateAt) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginación -->
        <footer class="pagination">
          <p>
            {{ total }} tickets · Página {{ page }} de {{ pages }}
          </p>

          <div class="pagination-actions">
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="loading || page <= 1"
              @click="changePage(page - 1)"
            >
              Anterior
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              :disabled="loading || page >= pages"
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
.tracking {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 20px;
  color: #182338;
  font-family: 'Inter', Arial, sans-serif;
}

.panel {
  padding: 24px;
  margin-bottom: 20px;
  background: #fff;
  border: 1px solid #dce3ee;
  border-radius: 14px;
}

.tracking-header h1 {
  margin: 18px 0 10px;
  font-size: 28px;
}

.subtitle {
  color: #475569;
  line-height: 1.5;
}

.back-link {
  color: #2457d6;
  font-weight: 600;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}

.consulted-date {
  margin-top: 16px;
  font-size: 13px;
  color: #64748b;
}

.filters {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 16px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
  flex: 1;
}

.filter-group label {
  font-size: 14px;
  font-weight: 600;
}

.filter-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

input,
select {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #b7c3d4;
  border-radius: 8px;
  font: inherit;
  color: #182338;
  background: #fff;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  text-decoration: none;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: #2457d6;
  color: #fff;
}

.btn-primary:hover {
  background: #1946b2;
}

.btn-secondary {
  background: #fff;
  color: #2457d6;
  border-color: #b7c3d4;
}

.btn-secondary:hover {
  background: #f1f5f9;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feedback-panel {
  padding: 32px;
}

.error-panel {
  border-color: #fecaca;
  color: #991b1b;
  background: #fff7f7;
}

.empty-state {
  padding: 30px 16px;
  text-align: center;
}

.empty-state p {
  color: #64748b;
  line-height: 1.5;
}

.section-title {
  margin: 0 0 20px;
  font-size: 20px;
}

.table-wrap {
  width: 100%;
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 850px;
  border-collapse: collapse;
  text-align: left;
}

th {
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  background: #f8fafc;
}

td,
th {
  padding: 16px 14px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
}

tbody tr:hover {
  background: #f8fafc;
}

.ticket-cell {
  min-width: 190px;
}

.ticket-link {
  color: #2457d6;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.description-cell {
  min-width: 200px;
  color: #475569;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.date-cell {
  min-width: 135px;
  white-space: normal;
  line-height: 1.5;
}

.status-badge {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-open {
  background: #dbeafe;
  color: #1e40af;
}

.status-assigned {
  background: #ede9fe;
  color: #5b21b6;
}

.status-progress {
  background: #fef3c7;
  color: #92400e;
}

.status-resolved {
  background: #d1fae5;
  color: #065f46;
}

.status-closed {
  background: #e2e8f0;
  color: #334155;
}

.status-default {
  background: #f1f5f9;
  color: #334155;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}

.pagination-actions {
  display: flex;
  gap: 10px;
}

.detail-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 20px;
  flex-wrap: wrap;
  margin: 24px 0;
}

.detail-heading h2 {
  margin: 8px 0;
  overflow-wrap: anywhere;
}

.ticket-number {
  font-size: 14px;
  font-weight: 700;
  color: #2457d6;
}

.detail-section {
  padding: 20px 0;
  border-top: 1px solid #e2e8f0;
}

.detail-section h3 {
  margin-top: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.detail-grid dt {
  color: #64748b;
  font-size: 13px;
  margin-bottom: 6px;
}

.detail-grid dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.closed-date {
  color: #475569;
}

.timeline {
  padding-left: 24px;
}

.timeline-item {
  padding: 8px 0 18px 12px;
  border-left: 2px solid #cbd5e1;
}

.timeline-action {
  margin: 0 0 6px;
  font-weight: 600;
}

.timeline-date {
  color: #64748b;
  font-size: 13px;
}

.empty-description {
  color: #64748b;
}

:focus-visible {
  outline: 3px solid #2457d6;
  outline-offset: 3px;
}

@media (max-width: 768px) {
  .tracking {
    padding: 16px;
  }

  .panel {
    padding: 18px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .filters {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-group {
    width: 100%;
  }

  .pagination {
    align-items: flex-start;
    flex-direction: column;
  }
}

/* Escritorio: se conserva la tabla */
.mobile-ticket-list {
  display: none;
}

/* Dispositivos móviles */
@media (max-width: 768px) {
  .tracking {
    width: 100%;
    max-width: 100%;
    padding: 16px;
    box-sizing: border-box;
  }

  .panel {
    padding: 18px;
  }

  /* Ocultar tabla de escritorio */
  .table-wrap {
    display: none;
  }

  /* Mostrar tarjetas móviles */
  .mobile-ticket-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .mobile-ticket-card {
    min-width: 0;
    padding: 18px;
    border: 1px solid #dce3ee;
    border-radius: 12px;
    background: #ffffff;
  }

  .mobile-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 14px;
  }

  .mobile-ticket-card h3 {
    margin: 0 0 12px;
    font-size: 17px;
    overflow-wrap: anywhere;
  }

  .mobile-description {
    color: #475569;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .mobile-ticket-info {
    display: grid;
    gap: 12px;
    margin: 16px 0;
    padding-top: 14px;
    border-top: 1px solid #e2e8f0;
  }

  .mobile-ticket-info dt {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 4px;
  }

  .mobile-ticket-info dd {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .mobile-detail-link {
    display: flex;
    width: 100%;
    box-sizing: border-box;
    margin-top: 16px;
  }

  .filter-actions {
    width: 100%;
  }

  .filter-actions .btn {
    flex: 1;
  }
}

</style>
