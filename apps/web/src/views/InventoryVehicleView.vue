<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError } from '@/api/http'
import {
  getVehicleByVin,
  getVehicleEvents,
  getVehicleWarranty,
  type Vehicle,
  type VehicleEvent,
  type WarrantyInfo,
} from '../services/inventory'

const router = useRouter()

// §10: VIN de 17 caracteres alfanuméricos, sin I, O ni Q.
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/

// Búsqueda
const vin = ref('')
const searching = ref(false)
const detailLoading = ref(false)

// Resultado
const vehicle = ref<Vehicle | null>(null)
const events = ref<VehicleEvent[]>([])
const warranty = ref<WarrantyInfo | null>(null)

// Mensajes
const error = ref('')
const eventsError = ref('')
const warrantyError = ref('')

// Etiquetas en español (NFR-006).
const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'En stock',
  RESERVED: 'Reservada',
  SOLD: 'Vendida',
  RETURNED: 'Devuelta',
}
const EVENT_LABELS: Record<string, string> = {
  ENTRY: 'Ingreso a inventario',
  SALE: 'Venta',
  RETURN: 'Devolución',
  TRANSFER: 'Traspaso',
  WARRANTY_CLAIM: 'Reclamo de garantía',
}
const WARRANTY_LABELS: Record<string, string> = {
  ACTIVE: 'Vigente',
  EXPIRED: 'Expirada',
  VOIDED: 'Anulada',
  NOT_APPLICABLE: 'No aplica',
}

const statusLabel = (status: string) => STATUS_LABELS[status] ?? status
const eventLabel = (type: string) => EVENT_LABELS[type] ?? type
const warrantyLabel = (status: string) => WARRANTY_LABELS[status] ?? status

function statusClass(status: string): string {
  switch (status) {
    case 'IN_STOCK': return 'badge-green'
    case 'RESERVED': return 'badge-amber'
    case 'RETURNED': return 'badge-red'
    default: return 'badge-slate' // SOLD y desconocidos
  }
}

function warrantyClass(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'badge-green'
    case 'VOIDED': return 'badge-red'
    default: return 'badge-slate' // EXPIRED, NOT_APPLICABLE
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Mensaje claro cuando falla una sección (garantía o eventos). */
function describeFailure(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (
      cause.code === 'INVENTORY_UNAVAILABLE' ||
      cause.status === 503 ||
      cause.kind === 'network' ||
      cause.kind === 'server'
    ) {
      return 'El inventario no responde en este momento.'
    }
    return cause.message
  }
  return 'No se pudo completar la consulta.'
}

/**
 * Clasifica el error de la búsqueda con el ApiError de api/http.ts
 * (kind: network | server | client, code del backend):
 * VIN inexistente, inventario caído o VIN inválido.
 */
function classifySearchError(cause: unknown): void {
  if (cause instanceof ApiError) {
    if (cause.code === 'INVENTORY_NOT_FOUND' || (cause.status === 404 && cause.kind === 'client')) {
      error.value = `No existe una motocicleta con el VIN ${vin.value}. Verifica que el número esté completo y correcto.`
      return
    }

    if (
      cause.code === 'INVENTORY_UNAVAILABLE' ||
      cause.status === 503 ||
      cause.kind === 'network' ||
      cause.kind === 'server'
    ) {
      error.value = 'El inventario no responde en este momento. Reintenta en unos minutos o avisa al administrador.'
      return
    }

    if (cause.status === 403) {
      error.value = 'Tu cuenta no tiene permiso para consultar el inventario.'
      return
    }

    if (cause.kind === 'client') {
      error.value = cause.message || 'El VIN enviado no es válido.'
      return
    }
  }

  error.value = cause instanceof Error ? cause.message : 'No se pudo consultar el inventario.'
}

async function search(): Promise<void> {
  if (searching.value || detailLoading.value) return

  const value = vin.value.trim().toUpperCase()
  vin.value = value

  error.value = ''
  eventsError.value = ''
  warrantyError.value = ''

  // §10: validar antes de gastar una llamada al servicio.
  if (!VIN_PATTERN.test(value)) {
    error.value = 'El VIN debe tener 17 caracteres alfanuméricos, sin I, O ni Q.'
    return
  }

  searching.value = true
  vehicle.value = null
  events.value = []
  warranty.value = null

  try {
    const found = await getVehicleByVin(value)
    vehicle.value = found

    // Garantía y eventos son consultas independientes: que falle una
    // no debe ocultar la ficha ni la otra sección.
    searching.value = false
    detailLoading.value = true

    const [eventsResult, warrantyResult] = await Promise.allSettled([
      getVehicleEvents(found.id),
      getVehicleWarranty(found.id),
    ])

    if (eventsResult.status === 'fulfilled') events.value = eventsResult.value
    else eventsError.value = describeFailure(eventsResult.reason)

    if (warrantyResult.status === 'fulfilled') warranty.value = warrantyResult.value
    else warrantyError.value = describeFailure(warrantyResult.reason)
  } catch (cause) {
    classifySearchError(cause)
  } finally {
    searching.value = false
    detailLoading.value = false
  }
}

/** Últimos eventos primero (venta, devolución, reclamo). */
const sortedEvents = computed(() =>
  [...events.value].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
)

/** Botón "Crear ticket con esta moto": prellena CreateTicketView (10.3). */
function createTicketWithVehicle(): void {
  if (!vehicle.value) return
  void router.push({
    name: 'create-ticket',
    query: {
      vin: vehicle.value.vin,
      model: `${vehicle.value.brand} ${vehicle.value.model} ${vehicle.value.year}`.trim(),
    },
  })
}
</script>

<template>
  <main class="page">
    <div class="card">
      <RouterLink to="/" class="back-link">← Volver al inicio</RouterLink>
      <h1>Consulta de motocicleta</h1>
      <p class="description">Busca una motocicleta por su VIN para ver su ficha, la garantía y sus últimos eventos.</p>

      <form class="search-form" novalidate @submit.prevent="search">
        <div class="form-group">
          <label for="vin">VIN de la motocicleta *</label>
          <input
            id="vin"
            v-model="vin"
            type="text"
            maxlength="17"
            autocomplete="off"
            spellcheck="false"
            placeholder="Ej. MD2A1AAX5RWA00004"
            :disabled="searching || detailLoading"
            :aria-invalid="error !== ''"
            aria-describedby="vin-error"
          />
          <span v-if="error" id="vin-error" class="error-text" role="alert" data-testid="inventory-error">
            {{ error }}
          </span>
        </div>
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="searching || detailLoading"
          :aria-busy="searching"
        >
          {{ searching ? 'Buscando…' : 'Buscar' }}
        </button>
      </form>

      <p v-if="searching" class="loading-message" role="status">Consultando el inventario…</p>

      <p v-if="!vehicle && !searching && !error" class="muted">Ingresa el VIN de 17 caracteres para consultar la ficha.</p>

      <!-- Ficha de la motocicleta -->
      <section v-if="vehicle" class="vehicle-card" aria-labelledby="vehicle-title" data-testid="vehicle-card">
        <h2 id="vehicle-title">{{ vehicle.brand }} {{ vehicle.model }} {{ vehicle.year }}</h2>

        <dl class="specs">
          <div class="spec"><dt>VIN</dt><dd class="mono">{{ vehicle.vin }}</dd></div>
          <div class="spec"><dt>Marca</dt><dd>{{ vehicle.brand }}</dd></div>
          <div class="spec"><dt>Modelo</dt><dd>{{ vehicle.model }}</dd></div>
          <div class="spec"><dt>Año</dt><dd>{{ vehicle.year }}</dd></div>
          <div class="spec">
            <dt>Estado</dt>
            <dd><span class="badge" :class="statusClass(vehicle.status)">{{ statusLabel(vehicle.status) }}</span></dd>
          </div>
          <div class="spec"><dt>Ubicación (ID de inventario)</dt><dd class="mono">{{ vehicle.locationId }}</dd></div>
        </dl>

        <div class="actions">
          <button
            type="button"
            class="btn btn-primary"
            data-testid="create-ticket-from-vehicle"
            :disabled="searching || detailLoading"
            @click="createTicketWithVehicle"
          >
            Crear ticket con esta moto
          </button>
        </div>
      </section>

      <p v-if="detailLoading && vehicle" class="loading-message" role="status">Cargando garantía y eventos…</p>

      <!-- Garantía -->
      <section v-if="vehicle" class="section-card" aria-labelledby="warranty-title" data-testid="warranty-section">
        <h2 id="warranty-title">Garantía</h2>

        <div v-if="warrantyError" class="error-box" role="alert">
          <p>{{ warrantyError }}</p>
        </div>

        <div v-else-if="warranty">
          <p class="warranty-line">
            <span class="badge" :class="warrantyClass(warranty.status)">{{ warrantyLabel(warranty.status) }}</span>
            <span v-if="warranty.coverage" class="coverage">Cobertura: {{ warranty.coverage }}</span>
          </p>

          <dl v-if="warranty.status === 'ACTIVE' || warranty.status === 'EXPIRED'" class="specs">
            <div class="spec"><dt>Inicio</dt><dd>{{ warranty.startDate ? formatDate(warranty.startDate) : '—' }}</dd></div>
            <div class="spec"><dt>Vence</dt><dd>{{ warranty.expiresAt ? formatDate(warranty.expiresAt) : '—' }}</dd></div>
            <div class="spec"><dt>Días restantes</dt><dd>{{ warranty.daysRemaining ?? '—' }}</dd></div>
            <div class="spec"><dt>Reclamos abiertos</dt><dd>{{ warranty.openClaims }}</dd></div>
          </dl>

          <p
            v-if="warranty.status === 'ACTIVE' && warranty.daysRemaining !== null && warranty.daysRemaining <= 30"
            class="notice"
            role="status"
          >
            La garantía vence pronto: quedan {{ warranty.daysRemaining }} días.
          </p>

          <p v-if="warranty.status === 'VOIDED'" class="voided-reason">
            Motivo de anulación: {{ warranty.voidedReason ?? 'sin detalle' }}
          </p>

          <p v-if="warranty.status === 'NOT_APPLICABLE'" class="muted">
            Esta motocicleta no tiene garantía aplicable.
          </p>
        </div>

        <p v-else class="muted">Sin información de garantía.</p>
      </section>

      <!-- Últimos eventos -->
      <section v-if="vehicle" class="section-card" aria-labelledby="events-title" data-testid="events-section">
        <h2 id="events-title">Últimos eventos</h2>

        <div v-if="eventsError" class="error-box" role="alert">
          <p>{{ eventsError }}</p>
        </div>

        <ul v-else-if="sortedEvents.length > 0" class="events">
          <li v-for="eventItem in sortedEvents" :key="eventItem.id" class="event">
            <span class="event-type">{{ eventLabel(eventItem.type) }}</span>
            <span class="event-date">{{ formatDate(eventItem.occurredAt) }}</span>
          </li>
        </ul>

        <p v-else class="muted">Sin eventos registrados para esta motocicleta.</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 32px 16px;
  background: var(--od-bg, #f8f9ff);
  color: var(--od-text, #0b1c30);
  font-family: 'Inter', Arial, sans-serif;
}

.card {
  max-width: 800px;
  margin: auto;
  padding: 32px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.05);
}

.back-link {
  color: #4f46e5;
  text-decoration: none;
  font-weight: 600;
  display: inline-block;
  margin-bottom: 16px;
}

.back-link:hover { text-decoration: underline; }

h1 { margin: 0 0 8px; font-size: 24px; }

h2 { margin: 0 0 16px; font-size: 18px; }

.description { color: #64748b; margin-bottom: 24px; line-height: 1.5; }

.muted { color: #64748b; font-size: 14px; }

.mono { font-family: 'JetBrains Mono', monospace; font-size: 13px; word-break: break-all; }

/* Buscador */
.search-form {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.search-form .form-group { flex: 1 1 320px; margin-bottom: 0; }

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

label { font-weight: 600; font-size: 14px; }

input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
  background: #fff;
  color: #0b1c30;
  text-transform: uppercase;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
  border-color: #4f46e5;
}

input[aria-invalid='true'] { border: 2px solid #b91c1c; }

.error-text {
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.4;
}

.error-box {
  background: #fef2f2;
  color: #991b1b;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #fecaca;
}

.error-box p { margin: 0; }

.loading-message { padding: 12px 0; color: #475569; }

/* Ficha y secciones */
.vehicle-card,
.section-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.vehicle-card { background: #f8fafc; }
.section-card { background: #ffffff; }

.specs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px 24px;
  margin: 0 0 16px;
}

.spec dt { font-size: 12px; color: #64748b; margin-bottom: 2px; }
.spec dd { margin: 0; font-size: 15px; }

.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid transparent;
}

.badge-green { background: #ecfdf5; color: #047857; border-color: #bbf7d0; }
.badge-amber { background: #fffbeb; color: #b45309; border-color: #fde68a; }
.badge-slate { background: #f8fafc; color: #475569; border-color: #e2e8f0; }
.badge-red { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }

.warranty-line { display: flex; align-items: center; gap: 12px; margin: 0 0 16px; flex-wrap: wrap; }
.coverage { color: #475569; font-size: 14px; }

.notice {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
}

.voided-reason { color: #b91c1c; font-size: 14px; }

.events { list-style: none; padding: 0; margin: 0; }

.event {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}

.event:last-child { border-bottom: none; }

.event-type { font-weight: 600; font-size: 14px; }
.event-date { color: #64748b; font-size: 13px; }

.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }

.btn {
  padding: 10px 16px;
  border-radius: 6px;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  font: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.btn:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }

.btn-primary { background: #4f46e5; color: #fff; }
.btn-primary:hover { background: #4338ca; }
.btn-primary:disabled { background: #a5b4fc; cursor: not-allowed; }

@media (max-width: 768px) {
  .card { padding: 20px; }
  .page { padding: 16px; }
  .search-form { flex-direction: column; align-items: stretch; }
  .btn { width: 100%; box-sizing: border-box; }
  .event { flex-direction: column; gap: 2px; }
}
</style>