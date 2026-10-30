
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import {
  getSupportOverview,
  getSupportWorkload,
  getSupportTickets,
  getSupportActivity,
  type ActivityResponse,
  type OverviewMetrics,
  type WorkloadResponse,
  type ReportTicketFilters,
  type ReportTicketsResponse,
} from '@/services/reports'

// FR-016: indicadores generales y carga de trabajo.
const overview = ref<OverviewMetrics | null>(null)
const workload = ref<WorkloadResponse | null>(null)
const loading = ref(false)
const error = ref('')
const previousData = ref(false)

let requestSequence = 0

const statusRows = computed(() => {
  const data = overview.value

  if (!data) return []

  return [
    { label: 'Abiertos', total: data.open },
    { label: 'Asignados', total: data.assigned },
    { label: 'En progreso', total: data.inProgress },
    { label: 'Resueltos', total: data.resolved },
    { label: 'Cerrados', total: data.closed },
  ]
})

const maxStatus = computed(() =>
  Math.max(
    1,
    ...statusRows.value.map(row => row.total),
  ),
)

const maxWorkload = computed(() =>
  Math.max(
    1,
    ...(workload.value?.technicians.map(
      technician => technician.pendingTickets,
    ) ?? []),
  ),
)

const priorityRows = computed(() =>
  overview.value?.byPriority ?? [],
)

function barWidth(
  value: number,
  maximum: number,
): string {
  return `${Math.round((value / maximum) * 100)}%`
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible'
  }

  return date.toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

async function refresh() {
  const currentRequest = ++requestSequence

  loading.value = true
  error.value = ''

  try {
    const [metrics, technicians] = await Promise.all([
      getSupportOverview(),
      getSupportWorkload(),
    ])

    if (currentRequest !== requestSequence) return

    overview.value = metrics
    workload.value = technicians
    previousData.value = false
  } catch {
    if (currentRequest !== requestSequence) return

    error.value =
      'No se pudieron obtener las estadísticas. Intenta actualizar nuevamente.'

    previousData.value = Boolean(
      overview.value && workload.value,
    )
  } finally {
    if (currentRequest === requestSequence) {
      loading.value = false
    }
  }
}

// FR-016: listado de tickets y filtros.
const filterStatus = ref('')
const filterPriorityId = ref('')
const filterTechnicianId = ref('')
const filterFrom = ref('')
const filterTo = ref('')

const appliedFilters = ref<ReportTicketFilters>({})

const ticketPageSize = 10
const ticketOffset = ref(0)

const reportTickets = ref<ReportTicketsResponse | null>(null)
const loadingTickets = ref(false)
const ticketsError = ref('')

let ticketRequestSequence = 0

const ticketPage = computed(() =>
  Math.floor(ticketOffset.value / ticketPageSize) + 1,
)

async function loadReportTickets() {
  const currentRequest = ++ticketRequestSequence

  loadingTickets.value = true
  ticketsError.value = ''
  reportTickets.value = null

  try {
    const response = await getSupportTickets({
      ...appliedFilters.value,
      limit: ticketPageSize,
      offset: ticketOffset.value,
    })

    if (currentRequest !== ticketRequestSequence) return

    reportTickets.value = response
  } catch {
    if (currentRequest !== ticketRequestSequence) return

    ticketsError.value =
      'No se pudo consultar el listado de tickets.'
  } finally {
    if (currentRequest === ticketRequestSequence) {
      loadingTickets.value = false
    }
  }
}

function applyReportFilters() {
  if (
    filterFrom.value &&
    filterTo.value &&
    filterFrom.value > filterTo.value
  ) {
    ticketsError.value =
      'La fecha final no puede ser anterior a la inicial.'
    return
  }

  appliedFilters.value = {
    status: filterStatus.value || undefined,

    priorityId: filterPriorityId.value
      ? Number(filterPriorityId.value)
      : undefined,

    technicianId: filterTechnicianId.value
      ? Number(filterTechnicianId.value)
      : undefined,

    from: filterFrom.value || undefined,
    to: filterTo.value || undefined,
  }

  ticketOffset.value = 0
  void loadReportTickets()
}

function clearReportFilters() {
  filterStatus.value = ''
  filterPriorityId.value = ''
  filterTechnicianId.value = ''
  filterFrom.value = ''
  filterTo.value = ''

  appliedFilters.value = {}
  ticketOffset.value = 0

  void loadReportTickets()
}

function nextTicketPage() {
  const current = reportTickets.value

  if (
    !current ||
    ticketOffset.value + current.items.length >=
      current.total
  ) {
    return
  }

  ticketOffset.value += ticketPageSize
  void loadReportTickets()
}

function previousTicketPage() {
  if (ticketOffset.value === 0) return

  ticketOffset.value = Math.max(
    0,
    ticketOffset.value - ticketPageSize,
  )

  void loadReportTickets()
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    Open: 'Abierto',
    Assigned: 'Asignado',
    'In Progress': 'En progreso',
    Resolved: 'Resuelto',
    Closed: 'Cerrado',
  }

  return labels[status] ?? status
}

// FR-016: actividad de tickets por periodo.
const activity = ref<ActivityResponse | null>(null)

const activityFrom = ref('')
const activityTo = ref('')

const loadingActivity = ref(false)
const activityError = ref('')

let activityRequestSequence = 0

const maxActivity = computed(() =>
  Math.max(
    1,
    ...(activity.value?.days.map(
      day => day.activities,
    ) ?? []),
  ),
)

const totalActivities = computed(() =>
  activity.value?.days.reduce(
    (total, day) => total + day.activities,
    0,
  ) ?? 0,
)

function activityDateLabel(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

async function loadActivity() {
  const currentRequest = ++activityRequestSequence

  loadingActivity.value = true
  activityError.value = ''
  activity.value = null

  try {
    const data = await getSupportActivity({
      from: activityFrom.value || undefined,
      to: activityTo.value || undefined,
    })

    if (currentRequest !== activityRequestSequence) return

    activity.value = data
  } catch {
    if (currentRequest !== activityRequestSequence) return

    activityError.value =
      'No se pudo consultar la actividad del periodo.'
  } finally {
    if (currentRequest === activityRequestSequence) {
      loadingActivity.value = false
    }
  }
}

function applyActivityFilters() {
  if (
    activityFrom.value &&
    activityTo.value &&
    activityFrom.value > activityTo.value
  ) {
    activityError.value =
      'La fecha final no puede ser anterior a la inicial.'
    return
  }

  void loadActivity()
}

function clearActivityFilters() {
  activityFrom.value = ''
  activityTo.value = ''

  void loadActivity()
}

// Actualizar todas las secciones.
function refreshAll() {
  void refresh()
  void loadReportTickets()
  void loadActivity()
}

// Cargar datos al entrar al panel.
onMounted(() => {
  void refresh()
  void loadReportTickets()
  void loadActivity()
})
</script>

<template>
  <main class="support-dashboard">

    <header class="panel-header">
      <div>
        <h1>Panel de soporte</h1>

        <p>
          Consulta las estadísticas y la carga de trabajo
          del servicio de soporte.
        </p>
      </div>

      <button
        type="button"
        class="refresh-button"
        :disabled="loading || loadingTickets || loadingActivity"
        @click="refreshAll"
      >
        {{
          loading || loadingTickets || loadingActivity
            ? 'Actualizando...'
            : 'Actualizar'
        }}
      </button>
    </header>

    <p
      v-if="error"
      class="error-message"
      role="alert"
    >
      {{ error }}
    </p>

    <p
      v-if="loading && !overview"
      class="message"
      role="status"
    >
      Cargando estadísticas...
    </p>

    <template v-if="overview && workload">

      <p class="update-date">
        {{
          previousData
            ? 'Datos anteriores, no actualizados'
            : 'Última actualización'
        }}:
        {{ formatDate(overview.generatedAt) }}
      </p>

      <!-- Indicadores generales -->
      <section aria-labelledby="indicators-title">
        <h2 id="indicators-title">
          Indicadores generales
        </h2>

        <div class="metrics-grid">
          <div class="metric-card">
            <span>Total de tickets</span>
            <strong>{{ overview.total }}</strong>
          </div>

          <div class="metric-card">
            <span>Abiertos</span>
            <strong>{{ overview.open }}</strong>
          </div>

          <div class="metric-card">
            <span>Asignados</span>
            <strong>{{ overview.assigned }}</strong>
          </div>

          <div class="metric-card">
            <span>En progreso</span>
            <strong>{{ overview.inProgress }}</strong>
          </div>

          <div class="metric-card">
            <span>Vencidos</span>
            <strong>{{ overview.overdue }}</strong>
          </div>

          <div class="metric-card">
            <span>Sin asignar</span>
            <strong>{{ overview.unassigned }}</strong>
          </div>

          <div class="metric-card">
            <span>Pendientes sin prioridad</span>
            <strong>{{ overview.withoutPriority }}</strong>
          </div>

          <div class="metric-card">
            <span>Cerrados</span>
            <strong>{{ overview.closed }}</strong>
          </div>
        </div>
      </section>

      <!-- Tickets por estado -->
      <section
        class="section"
        aria-labelledby="status-title"
      >
        <h2 id="status-title">
          Tickets por estado
        </h2>

        <p
          v-if="overview.total === 0"
          class="message"
        >
          No hay tickets registrados.
        </p>

        <div
          v-for="status in statusRows"
          :key="status.label"
          class="chart-row"
        >
          <div class="chart-label">
            <span>{{ status.label }}</span>
            <strong>{{ status.total }}</strong>
          </div>

          <div class="chart-bar">
            <div
              class="chart-fill"
              :style="{
                width: barWidth(
                  status.total,
                  maxStatus
                )
              }"
            />
          </div>
        </div>
      </section>

      <!-- Tickets por prioridad -->
      <section
        class="section"
        aria-labelledby="priority-title"
      >
        <h2 id="priority-title">
          Tickets por prioridad
        </h2>

        <p
          v-if="priorityRows.length === 0"
          class="message"
        >
          No hay tickets para mostrar.
        </p>

        <div
          v-for="priority in priorityRows"
          :key="priority.priorityId ?? 'none'"
          class="detail-row"
        >
          <span>
            {{
              priority.priorityId === null
                ? 'Sin prioridad'
                : `Prioridad ID ${priority.priorityId}`
            }}
          </span>

          <strong>{{ priority.total }}</strong>
        </div>
      </section>

      <!-- Carga por técnico -->
      <section
        class="section"
        aria-labelledby="workload-title"
      >
        <h2 id="workload-title">
          Carga de trabajo por técnico
        </h2>

        <p class="section-description">
          Cantidad de tickets pendientes asignados
          actualmente. No representa productividad.
        </p>

        <p
          v-if="workload.technicians.length === 0"
          class="message"
        >
          No hay técnicos con tickets pendientes.
        </p>

        <div
          v-for="technician in workload.technicians"
          :key="technician.technicianId"
          class="chart-row"
        >
          <div class="chart-label">
            <span>
              Técnico ID {{ technician.technicianId }}
            </span>

            <strong>
              {{ technician.pendingTickets }} tickets
            </strong>
          </div>

          <div class="chart-bar">
            <div
              class="chart-fill"
              :style="{
                width: barWidth(
                  technician.pendingTickets,
                  maxWorkload
                )
              }"
            />
          </div>
        </div>
      </section>
    </template>

    <!-- Consulta de tickets -->
    <section
      class="section"
      aria-labelledby="report-tickets-title"
    >
      <h2 id="report-tickets-title">
        Consultar tickets
      </h2>

      <p class="section-description">
        Filtra los tickets por estado, prioridad,
        técnico o fecha.
      </p>

      <form
        class="report-filters"
        @submit.prevent="applyReportFilters"
      >
        <label>
          Estado

          <select v-model="filterStatus">
            <option value="">Todos</option>
            <option value="Open">Abierto</option>
            <option value="Assigned">Asignado</option>
            <option value="In Progress">En progreso</option>
            <option value="Resolved">Resuelto</option>
            <option value="Closed">Cerrado</option>
          </select>
        </label>

        <label>
          ID de prioridad

          <input
            v-model="filterPriorityId"
            type="number"
            min="1"
            step="1"
            placeholder="Todas"
          >
        </label>

        <label>
          ID del técnico

          <input
            v-model="filterTechnicianId"
            type="number"
            min="1"
            step="1"
            placeholder="Todos"
          >
        </label>

        <label>
          Desde
          <input v-model="filterFrom" type="date">
        </label>

        <label>
          Hasta
          <input v-model="filterTo" type="date">
        </label>

        <div class="report-filter-actions">
          <button
            type="submit"
            :disabled="loadingTickets"
          >
            Aplicar filtros
          </button>

          <button
            type="button"
            :disabled="loadingTickets"
            @click="clearReportFilters"
          >
            Limpiar
          </button>
        </div>
      </form>

      <p
        v-if="loadingTickets"
        class="message"
        role="status"
      >
        Cargando tickets...
      </p>

      <p
        v-if="ticketsError"
        class="error-message"
        role="alert"
      >
        {{ ticketsError }}
      </p>

      <template v-if="reportTickets">

        <p class="report-total">
          Resultados encontrados:
          {{ reportTickets.total }}
        </p>

        <p
          v-if="reportTickets.items.length === 0"
          class="message"
          role="status"
        >
          No se encontraron tickets con esos filtros.
        </p>

        <div
          v-else
          class="report-table-container"
        >
          <table class="report-table">
            <thead>
              <tr>
                <th scope="col">Ticket</th>
                <th scope="col">Estado</th>
                <th scope="col">Prioridad</th>
                <th scope="col">Técnico</th>
                <th scope="col">Fecha de creación</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="ticket in reportTickets.items"
                :key="ticket.id"
              >
                <td>
                  <RouterLink
                    :to="{
                      name: 'ticket-detail',
                      params: { id: ticket.id }
                    }"
                  >
                    #{{ ticket.id }} — {{ ticket.title }}
                  </RouterLink>
                </td>

                <td>
                  {{ statusLabel(ticket.status) }}
                </td>

                <td>
                  {{
                    ticket.priorityId === null
                      ? 'Sin prioridad'
                      : `ID ${ticket.priorityId}`
                  }}
                </td>

                <td>
                  {{
                    ticket.technicianId === null
                      ? 'Sin asignar'
                      : `ID ${ticket.technicianId}`
                  }}
                </td>

                <td>
                  {{ formatDate(ticket.createdAt) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="report-pagination">
          <button
            type="button"
            :disabled="
              loadingTickets ||
              ticketOffset === 0
            "
            @click="previousTicketPage"
          >
            Anterior
          </button>

          <span>Página {{ ticketPage }}</span>

          <button
            type="button"
            :disabled="
              loadingTickets ||
              ticketOffset + reportTickets.items.length >=
                reportTickets.total
            "
            @click="nextTicketPage"
          >
            Siguiente
          </button>
        </div>
      </template>
    </section>

    <!-- Actividad de tickets por periodo -->
    <section
      class="section"
      aria-labelledby="activity-title"
    >
      <h2 id="activity-title">
        Actividad de tickets por periodo
      </h2>

      <p class="section-description">
        Muestra las acciones registradas en el historial.
        Un ticket puede tener varias actividades.
        Sin filtros se consultan los últimos 30 días.
      </p>

      <form
        class="report-filters"
        @submit.prevent="applyActivityFilters"
      >
        <label>
          Fecha inicial

          <input
            v-model="activityFrom"
            type="date"
          >
        </label>

        <label>
          Fecha final

          <input
            v-model="activityTo"
            type="date"
          >
        </label>

        <div class="report-filter-actions">
          <button
            type="submit"
            :disabled="loadingActivity"
          >
            Consultar actividad
          </button>

          <button
            type="button"
            :disabled="loadingActivity"
            @click="clearActivityFilters"
          >
            Limpiar
          </button>
        </div>
      </form>

      <p
        v-if="loadingActivity"
        class="message"
        role="status"
      >
        Cargando actividad...
      </p>

      <p
        v-if="activityError"
        class="error-message"
        role="alert"
      >
        {{ activityError }}
      </p>

      <template v-if="activity">

        <p class="report-total">
          Total de actividades: {{ totalActivities }}
        </p>

        <p
          v-if="activity.days.length === 0"
          class="message"
          role="status"
        >
          No se registraron actividades en este periodo.
        </p>

        <div
          v-for="day in activity.days"
          :key="day.date"
          class="chart-row"
        >
          <div class="chart-label">
            <span>
              {{ activityDateLabel(day.date) }}
            </span>

            <strong>
              {{ day.activities }}
              {{
                day.activities === 1
                  ? 'actividad'
                  : 'actividades'
              }}
              ·
              {{ day.tickets }}
              {{
                day.tickets === 1
                  ? 'ticket'
                  : 'tickets'
              }}
            </strong>
          </div>

          <div class="chart-bar">
            <div
              class="chart-fill"
              :style="{
                width: barWidth(
                  day.activities,
                  maxActivity
                )
              }"
            />
          </div>
        </div>

        <p class="section-description">
          Solo aparecen los días que registraron actividad.
          Los días sin movimientos no se grafican.
        </p>
      </template>
    </section>

  </main>
</template>

<style scoped>
.support-dashboard {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
}

.panel-header h1 {
  margin: 0 0 8px;
  color: #1e293b;
}

.panel-header p,
.section-description,
.update-date,
.message {
  color: #64748b;
  line-height: 1.5;
}

.refresh-button {
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-button:focus-visible {
  outline: 3px solid #1e40af;
  outline-offset: 3px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(190px, 1fr)
  );
  gap: 16px;
  margin-top: 20px;
}

.metric-card,
.section {
  padding: 22px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: white;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.metric-card span {
  color: #64748b;
  font-size: 14px;
}

.metric-card strong {
  font-size: 30px;
  color: #1e293b;
}

.section {
  margin-top: 24px;
}

.section h2 {
  margin: 0 0 18px;
  font-size: 20px;
  color: #1e293b;
}

.chart-row {
  margin: 16px 0;
}

.chart-label,
.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.chart-bar {
  height: 12px;
  border-radius: 20px;
  background: #e2e8f0;
  overflow: hidden;
}

.chart-fill {
  height: 100%;
  background: #2563eb;
  border-radius: 20px;
}

.detail-row {
  padding: 12px 0;
  border-bottom: 1px solid #e2e8f0;
}

.error-message {
  padding: 14px;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  color: #991b1b;
  background: #fef2f2;
}

.report-filters {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(150px, 1fr)
  );
  gap: 16px;
  margin: 20px 0;
}

.report-filters label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-weight: 500;
}

.report-filters input,
.report-filters select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
}

.report-filters input:focus-visible,
.report-filters select:focus-visible,
.report-filter-actions button:focus-visible,
.report-pagination button:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 2px;
}

.report-filter-actions,
.report-pagination {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.report-filter-actions button,
.report-pagination button {
  padding: 10px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: white;
  cursor: pointer;
}

.report-filter-actions button:disabled,
.report-pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.report-total {
  font-weight: 600;
  margin: 16px 0;
}

.report-table-container {
  width: 100%;
  overflow-x: auto;
}

.report-table {
  width: 100%;
  min-width: 650px;
  border-collapse: collapse;
}

.report-table th,
.report-table td {
  padding: 12px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}

.report-table th {
  background: #f8fafc;
}

.report-table a {
  color: #2563eb;
}

.report-pagination {
  justify-content: space-between;
  margin-top: 20px;
}

@media (max-width: 600px) {
  .support-dashboard {
    padding: 16px;
  }

  .panel-header {
    flex-direction: column;
  }

  .refresh-button {
    width: 100%;
  }

  .metrics-grid {
    grid-template-columns: repeat(
      2,
      minmax(0, 1fr)
    );
  }

  .metric-card {
    padding: 14px;
  }

  .metric-card strong {
    font-size: 24px;
  }

  .chart-label {
    flex-wrap: wrap;
  }
}
</style>
