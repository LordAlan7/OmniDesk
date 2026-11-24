<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/api/http'
import { usePermissionVisibility } from '../composables/useFormAccess'
import {
  getCompatibleProducts,
  getVehicleWarranty,
  INVENTORY_READ,
  type CompatibleProduct,
  type StockLevel,
  type Vehicle,
  type WarrantyInfo,
} from '../services/inventory'
import type { Ticket } from '../services/tickets'

/**
 * Paso 12: sección "Motocicleta" del detalle del ticket.
 *
 * - Datos vinculados: copia mínima guardada en el ticket (VIN, marca, modelo, año).
 * - Datos vivos: la moto resuelta por el padre (estado en inventario), garantía
 *   y refacciones compatibles, cargadas bajo demanda.
 * - Sin precios: el backend nunca los envía (contrato §4).
 * - Se oculta por completo sin el permiso inventory:read.
 */
const props = withDefaults(
  defineProps<{
    ticket: Pick<Ticket, 'vehicleVin' | 'vehicleBrand' | 'vehicleModel' | 'vehicleYear'>
    /** Moto resuelta por el padre a partir del VIN (null si no se pudo consultar). */
    vehicle?: Vehicle | null
    /** Muestra la acción rápida "Preguntar a la IA sobre esta moto". */
    canAskAi?: boolean
  }>(),
  { vehicle: null, canAskAi: false },
)

const emit = defineEmits<{ (e: 'ask-ai'): void }>()

const { visible } = usePermissionVisibility(INVENTORY_READ)

const MAX_ROWS = 10

const warranty = ref<WarrantyInfo | null>(null)
const warrantyLoading = ref(false)
const warrantyError = ref('')

const products = ref<CompatibleProduct[]>([])
const productsLoaded = ref(false)
const productsLoading = ref(false)
const productsError = ref('')

let sequence = 0

const hasVin = computed(() => !!props.ticket.vehicleVin)
const shownProducts = computed(() => products.value.slice(0, MAX_ROWS))

const vehicleStatusLabels: Record<string, string> = {
  IN_STOCK: 'En inventario',
  RESERVED: 'Reservada',
  SOLD: 'Vendida',
  RETURNED: 'Devuelta',
}

const warrantyStatusLabels: Record<string, string> = {
  ACTIVE: 'Vigente',
  EXPIRED: 'Vencida',
  VOIDED: 'Anulada',
  NOT_APPLICABLE: 'No aplica',
}

const stockLabels: Record<StockLevel, string> = {
  AVAILABLE: 'Disponible',
  LOW: 'Bajo',
  OUT: 'Agotado',
}

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-MX', { dateStyle: 'medium' })
}

function describeError(cause: unknown, what: string): string {
  if (cause instanceof ApiError) {
    if (cause.kind === 'network' || cause.kind === 'server') {
      return 'El inventario no está disponible en este momento. El ticket no se ve afectado; intenta de nuevo más tarde.'
    }
    if (cause.status === 404) return `No se encontró ${what} en el inventario.`
    return cause.message
  }
  return `No se pudo consultar ${what}.`
}

async function loadWarranty(): Promise<void> {
  const vehicleId = props.vehicle?.id
  if (!vehicleId || warrantyLoading.value) return

  const current = sequence
  warrantyLoading.value = true
  warrantyError.value = ''

  try {
    const result = await getVehicleWarranty(vehicleId)
    if (current !== sequence) return
    warranty.value = result
  } catch (cause) {
    if (current !== sequence) return
    warranty.value = null
    warrantyError.value = describeError(cause, 'la garantía')
  } finally {
    if (current === sequence) warrantyLoading.value = false
  }
}

async function loadProducts(): Promise<void> {
  const vehicleId = props.vehicle?.id
  if (!vehicleId || productsLoading.value) return

  const current = sequence
  productsLoading.value = true
  productsError.value = ''

  try {
    const result = await getCompatibleProducts(vehicleId)
    if (current !== sequence) return
    products.value = result
    productsLoaded.value = true
  } catch (cause) {
    if (current !== sequence) return
    products.value = []
    productsLoaded.value = false
    productsError.value = describeError(cause, 'las refacciones compatibles')
  } finally {
    if (current === sequence) productsLoading.value = false
  }
}

// Si cambia la moto (otro ticket o VIN), se descarta lo cargado y se invalidan las peticiones en vuelo.
watch(
  () => props.vehicle?.id,
  () => {
    sequence += 1
    warranty.value = null
    warrantyError.value = ''
    warrantyLoading.value = false
    products.value = []
    productsLoaded.value = false
    productsError.value = ''
    productsLoading.value = false
  },
)
</script>

<template>
  <div
    v-if="visible"
    class="vehicle-panel"
    data-testid="ticket-vehicle-panel"
  >
    <h2>Motocicleta</h2>

    <p
      v-if="!hasVin"
      class="hint"
    >
      Este ticket no tiene una motocicleta vinculada del inventario.
    </p>

    <template v-else>
      <dl class="linked">
        <div>
          <dt>VIN</dt>
          <dd data-testid="vehicle-linked-vin">{{ ticket.vehicleVin }}</dd>
        </div>
        <div>
          <dt>Marca</dt>
          <dd>{{ ticket.vehicleBrand || 'Sin registrar' }}</dd>
        </div>
        <div>
          <dt>Modelo</dt>
          <dd>{{ ticket.vehicleModel || 'Sin registrar' }}</dd>
        </div>
        <div>
          <dt>Año</dt>
          <dd>{{ ticket.vehicleYear ?? 'Sin registrar' }}</dd>
        </div>
        <div v-if="vehicle">
          <dt>Estado en inventario</dt>
          <dd>{{ vehicleStatusLabels[vehicle.status] ?? vehicle.status }}</dd>
        </div>
      </dl>

      <p class="hint">
        Marca, modelo y año son la copia guardada en el ticket al vincular la moto.
      </p>

      <p
        v-if="!vehicle"
        class="hint"
        role="status"
        data-testid="vehicle-unresolved"
      >
        No se pudo consultar esta moto en el inventario ahora mismo. Se muestran
        solo los datos guardados en el ticket.
      </p>

      <div class="actions">
        <button
          v-if="canAskAi"
          type="button"
          data-testid="vehicle-ask-ai"
          @click="emit('ask-ai')"
        >
          Preguntar a la IA sobre esta moto
        </button>
        <button
          type="button"
          class="secondary"
          data-testid="vehicle-load-warranty"
          :disabled="!vehicle || warrantyLoading"
          @click="loadWarranty"
        >
          {{ warrantyLoading ? 'Consultando…' : 'Ver garantía' }}
        </button>
        <button
          type="button"
          class="secondary"
          data-testid="vehicle-load-products"
          :disabled="!vehicle || productsLoading"
          @click="loadProducts"
        >
          {{ productsLoading ? 'Consultando…' : 'Ver refacciones compatibles' }}
        </button>
      </div>

      <section
        v-if="warrantyError || warranty"
        class="block"
        aria-label="Garantía"
      >
        <h3>Garantía</h3>
        <p
          v-if="warrantyError"
          class="error"
          role="alert"
        >
          {{ warrantyError }}
        </p>
        <dl
          v-else-if="warranty"
          class="linked"
          data-testid="vehicle-warranty"
        >
          <div>
            <dt>Estado</dt>
            <dd>{{ warrantyStatusLabels[warranty.status] ?? warranty.status }}</dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{{ formatDate(warranty.startDate) }}</dd>
          </div>
          <div>
            <dt>Vence</dt>
            <dd>{{ formatDate(warranty.expiresAt) }}</dd>
          </div>
          <div v-if="warranty.daysRemaining !== null">
            <dt>Días restantes</dt>
            <dd>{{ warranty.daysRemaining }}</dd>
          </div>
          <div v-if="warranty.coverage">
            <dt>Cobertura</dt>
            <dd>{{ warranty.coverage }}</dd>
          </div>
          <div>
            <dt>Reclamos abiertos</dt>
            <dd>{{ warranty.openClaims }}</dd>
          </div>
        </dl>
      </section>

      <section
        v-if="productsError || productsLoaded"
        class="block"
        aria-label="Refacciones compatibles"
      >
        <h3>Refacciones compatibles</h3>
        <p
          v-if="productsError"
          class="error"
          role="alert"
        >
          {{ productsError }}
        </p>
        <p
          v-else-if="products.length === 0"
          class="hint"
        >
          No hay refacciones compatibles registradas para esta moto.
        </p>
        <template v-else>
          <ul
            class="products"
            data-testid="vehicle-products"
          >
            <li
              v-for="product in shownProducts"
              :key="product.id"
            >
              <span class="sku">{{ product.sku }}</span>
              <span class="name">{{ product.name }}</span>
              <span
                class="level"
                :data-level="product.stockLevel"
              >
                {{ stockLabels[product.stockLevel] ?? product.stockLevel }}
              </span>
            </li>
          </ul>
          <p
            v-if="products.length > MAX_ROWS"
            class="hint"
          >
            Se muestran {{ MAX_ROWS }} de {{ products.length }}. Usa el buscador
            de refacciones de este ticket para ver el resto y las existencias
            por ubicación.
          </p>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.vehicle-panel h2 { margin-top: 0; }
.vehicle-panel h3 { margin: 16px 0 8px; font-size: 15px; color: #464555; }
.linked { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 12px 0; }
.linked dt { font-size: 12px; color: #5f6b7a; }
.linked dd { margin: 2px 0 0; font-weight: 600; overflow-wrap: anywhere; }
.hint { color: #5f6b7a; font-size: 13px; line-height: 1.5; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.actions button { padding: 9px 14px; border: 1px solid #2457d6; border-radius: 8px; background: #2457d6; color: white; font: inherit; cursor: pointer; }
.actions button.secondary { background: white; color: #2457d6; }
.actions button:disabled { opacity: 0.5; cursor: default; }
.actions button:focus-visible { outline: 2px solid #2457d6; outline-offset: 3px; }
.block { margin-top: 16px; padding-top: 4px; border-top: 1px solid #e4e9f1; }
.error { padding: 12px; border-radius: 8px; background: #fff0f0; color: #a52121; overflow-wrap: anywhere; }
.products { list-style: none; margin: 0; padding: 0; }
.products li { display: grid; grid-template-columns: 140px 1fr auto; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid #e4e9f1; }
.sku { font-family: monospace; font-weight: 600; overflow-wrap: anywhere; }
.name { overflow-wrap: anywhere; }
.level { padding: 3px 10px; border-radius: 20px; background: #edf1fb; color: #2457d6; font-size: 13px; }
.level[data-level='LOW'] { background: #fffbeb; color: #92400e; }
.level[data-level='OUT'] { background: #fff0f0; color: #a52121; }
@media (max-width: 600px) {
  .products li { grid-template-columns: 1fr; gap: 4px; }
  .actions button { width: 100%; min-height: 44px; }
}
</style>