<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ApiError } from '@/api/http'
import {
  getCompatibleProducts,
  getProductStock,
  getVehicleByVin,
  listProducts,
  listVehicleModels,
  type CompatibleProduct,
  type Product,
  type StockInfo,
  type StockLevel,
  type Vehicle,
  type VehicleModel,
} from '../services/inventory'

/**
 * Panel reutilizable de refacciones (paso 11).
 *
 * Dos modos sobre el mismo contrato (§3):
 *  - Con moto (VIN resuelto o inyectada por el padre): tabla de refacciones
 *    COMPATIBLES de esa unidad (getCompatibleProducts), con existencias totales.
 *  - Sin moto: catálogo general con búsqueda por código o nombre (listProducts).
 *
 * Fila expandible → existencias por ubicación (getProductStock) con indicador
 * Disponible / Bajo / Agotado. Sin precios: el backend nunca los envía (§4).
 */
const props = withDefaults(
  defineProps<{
    /** Moto ya resuelta por el padre (p. ej. detalle del ticket con VIN). */
    vehicle?: Vehicle | null
    /** Modo compacto (dentro del detalle del ticket): sin VIN ni filtro de modelo. */
    compact?: boolean
  }>(),
  { vehicle: null, compact: false },
)

/** La refacción elegida lleva su SKU (el padre lo copia a la resolución del ticket). */
const emit = defineEmits<{ (e: 'select', product: Product): void }>()

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/
const LIMIT = 10

// --- Moto: la inyecta el padre o se resuelve aquí por VIN ---
const resolvedVehicle = ref<Vehicle | null>(null)
const vinInput = ref('')
const vinError = ref('')

// --- Búsqueda por código o nombre ---
const search = ref('')
const appliedSearch = ref('')

// --- Filtro por modelo y año ---
const models = ref<VehicleModel[]>([])
const modelsError = ref('')
const yearFilter = ref<number | null>(null)
const selectedModelId = ref('')

// --- Tabla ---
/** Fila unificada: catálogo (Product) o compatibles (+ existencias calculadas). */
type Row = Product & { stockTotal?: number; stockLevel?: StockLevel }

const rows = ref<Row[]>([])
const catalogTotal = ref(0)
const page = ref(1)

// --- Orden (client-side sobre los resultados en pantalla) ---
const sortKey = ref<'sku' | 'name' | 'stock'>('sku')
const sortDir = ref<'asc' | 'desc'>('asc')

// --- Existencias por ubicación (expandido por fila, con caché) ---
const expanded = ref<string | null>(null)
const stocks = reactive<Record<string, StockInfo>>({})
const stockErrors = reactive<Record<string, string>>({})
const loadingStock = ref(false)

// --- Estados de carga / vacío / error (ApiError ya clasificado) ---
const loading = ref(false)
const error = ref('')
const copiedSku = ref('')

// --- Modos ---
const activeVehicle = computed(() => props.vehicle ?? resolvedVehicle.value)
const compatMode = computed(() => activeVehicle.value !== null)
const lockedVehicle = computed(() => props.vehicle !== null)
const showVinSearch = computed(() => !lockedVehicle.value && !props.compact)
const showModelFilter = computed(() => !lockedVehicle.value && !props.compact)

const selectedModel = computed(
  () => models.value.find((m) => m.id === selectedModelId.value) ?? null,
)

/** Filtro por año: el modelo aplica si el año cae en [yearFrom, yearTo] (null = abierto). */
const filteredModels = computed(() => {
  const year = yearFilter.value
  if (year === null || Number.isNaN(year)) return models.value
  return models.value.filter((m) => {
    const from = m.yearFrom ?? Number.NEGATIVE_INFINITY
    const to = m.yearTo ?? Number.POSITIVE_INFINITY
    return year >= from && year <= to
  })
})

/** Filas base: en compatibles, la búsqueda filtra en cliente por nombre o SKU. */
const baseRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!compatMode.value || q === '') return rows.value
  return rows.value.filter(
    (r) => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q),
  )
})

const total = computed(() =>
  compatMode.value ? baseRows.value.length : catalogTotal.value,
)

const sortedRows = computed(() => {
  const list = [...baseRows.value]
  const dir = sortDir.value === 'asc' ? 1 : -1

  list.sort((a, b) => {
    let cmp = 0
    if (sortKey.value === 'sku') cmp = a.sku.localeCompare(b.sku)
    else if (sortKey.value === 'name') cmp = a.name.localeCompare(b.name)
    else cmp = (a.stockTotal ?? 0) - (b.stockTotal ?? 0)
    return cmp * dir
  })

  return list
})

/** En compatibles la paginación es local (el endpoint no pagina); en catálogo ya viene paginado. */
const visibleRows = computed(() => {
  if (!compatMode.value) return sortedRows.value
  const start = (page.value - 1) * LIMIT
  return sortedRows.value.slice(start, start + LIMIT)
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)))

const LEVEL_LABELS: Record<StockLevel, string> = {
  AVAILABLE: 'Disponible',
  LOW: 'Bajo',
  OUT: 'Agotado',
}

function levelLabel(level: StockLevel): string {
  return LEVEL_LABELS[level]
}

function levelClass(level: StockLevel): string {
  return { AVAILABLE: 'badge-green', LOW: 'badge-amber', OUT: 'badge-red' }[level]
}

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

// --- Carga de datos ---
async function loadModels(): Promise<void> {
  try {
    models.value = await listVehicleModels()
  } catch (cause) {
    modelsError.value = describeFailure(cause)
  }
}

async function runCompat(vehicle: Vehicle): Promise<void> {
  loading.value = true
  error.value = ''

  try {
    rows.value = (await getCompatibleProducts(vehicle.id)) as Row[]
  } catch (cause) {
    error.value = describeFailure(cause)
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadCatalog(): Promise<void> {
  loading.value = true
  error.value = ''

  try {
    const result = await listProducts({
      search: appliedSearch.value || undefined,
      page: page.value,
      limit: LIMIT,
    })
    rows.value = result.data as Row[]
    catalogTotal.value = result.meta?.total ?? result.data.length
  } catch (cause) {
    error.value = describeFailure(cause)
    rows.value = []
  } finally {
    loading.value = false
  }
}

// --- Interacción ---
async function resolveVin(): Promise<void> {
  if (loading.value) return

  const value = vinInput.value.trim().toUpperCase()
  vinError.value = ''

  if (value === '') {
    await clearVehicle()
    return
  }

  if (!VIN_PATTERN.test(value)) {
    vinError.value = 'El VIN debe tener 17 caracteres alfanuméricos, sin I, O ni Q.'
    return
  }

  loading.value = true

  try {
    const vehicle = await getVehicleByVin(value)
    resolvedVehicle.value = vehicle
    selectedModelId.value = vehicle.modelId ?? ''
    search.value = ''
    appliedSearch.value = ''
    page.value = 1
    await runCompat(vehicle)
  } catch (cause) {
    if (
      cause instanceof ApiError &&
      (cause.code === 'INVENTORY_NOT_FOUND' || (cause.status === 404 && cause.kind === 'client'))
    ) {
      vinError.value = `No existe una motocicleta con el VIN ${value}.`
    } else {
      vinError.value = describeFailure(cause)
    }
  } finally {
    loading.value = false
  }
}

async function clearVehicle(): Promise<void> {
  resolvedVehicle.value = null
  selectedModelId.value = ''
  search.value = ''
  appliedSearch.value = ''
  page.value = 1
  await loadCatalog()
}

function runSearch(): void {
  if (loading.value) return

  const q = search.value.trim()

  if (!compatMode.value) {
    // §10: el backend rechaza búsquedas de menos de 2 caracteres.
    if (q.length === 1) {
      error.value = 'Escribe al menos 2 caracteres para buscar.'
      return
    }
    appliedSearch.value = q
    page.value = 1
    void loadCatalog()
  } else {
    // En compatibles el filtro es local sobre los compatibles de la moto.
    page.value = 1
  }
}

async function changePage(delta: number): Promise<void> {
  const next = page.value + delta
  if (next < 1 || next > totalPages.value || loading.value) return

  page.value = next

  if (!compatMode.value) await loadCatalog()
}

function toggleSort(key: 'sku' | 'name' | 'stock'): void {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

async function toggleStock(row: Row): Promise<void> {
  if (expanded.value === row.id) {
    expanded.value = null
    return
  }

  expanded.value = row.id

  if (stocks[row.id] || stockErrors[row.id]) return

  loadingStock.value = true

  try {
    stocks[row.id] = await getProductStock(row.id)
  } catch (cause) {
    stockErrors[row.id] = describeFailure(cause)
  } finally {
    loadingStock.value = false
  }
}

/** Copia el SKU al portapapeles y avisa al padre (resolución del ticket). */
async function copySku(row: Row): Promise<void> {
  emit('select', row)

  try {
    await navigator.clipboard.writeText(row.sku)
    copiedSku.value = row.sku
    setTimeout(() => {
      if (copiedSku.value === row.sku) copiedSku.value = ''
    }, 2500)
  } catch {
    // Sin clipboard (contexto no seguro): el padre ya recibió el SKU por 'select'.
  }
}

function ariaSort(
  key: 'sku' | 'name' | 'stock',
): 'none' | 'ascending' | 'descending' {
  if (sortKey.value !== key) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

// Si el padre resuelve la moto después de montar (detalle del ticket).
watch(
  () => props.vehicle,
  (vehicle) => {
    page.value = 1
    search.value = ''
    expanded.value = null

    if (vehicle) void runCompat(vehicle)
    else {
      rows.value = []
      void loadCatalog()
    }
  },
)

onMounted(() => {
  void loadModels()

  if (props.vehicle) void runCompat(props.vehicle)
  else void loadCatalog()
})
</script>

<template>
  <section class="parts-lookup" :aria-busy="loading" data-testid="parts-panel">
    <h2 :class="{ 'compact-title': props.compact }">Refacciones y existencias</h2>

    <!-- VIN (solo vista independiente) -->
    <form v-if="showVinSearch" class="vin-bar" novalidate @submit.prevent="resolveVin">
      <div class="form-group grow">
        <label for="parts-vin">VIN de la motocicleta (opcional, para compatibles)</label>
        <input
          id="parts-vin"
          v-model="vinInput"
          type="text"
          maxlength="17"
          autocomplete="off"
          spellcheck="false"
          placeholder="Ej. MD2A1AAX5RWA00004"
          :disabled="loading"
        />
        <span v-if="vinError" class="error-text" role="alert" data-testid="parts-vin-error">
          {{ vinError }}
        </span>
      </div>
      <button type="submit" class="btn btn-primary" :disabled="loading">
        {{ loading ? 'Consultando…' : 'Ver compatibles' }}
      </button>
      <button
        v-if="resolvedVehicle"
        type="button"
        class="btn btn-secondary"
        :disabled="loading"
        @click="clearVehicle"
      >
        Usar catálogo
      </button>
    </form>

    <!-- Contexto de la moto activa -->
    <p v-if="activeVehicle" class="vehicle-chip" data-testid="parts-vehicle-context">
      Compatibles de
      <strong>{{ activeVehicle.brand }} {{ activeVehicle.model }} {{ activeVehicle.year }}</strong>
      <span class="mono">· VIN {{ activeVehicle.vin }}</span>
    </p>

    <!-- Filtro por modelo y año (solo vista independiente) -->
    <div v-if="showModelFilter" class="filters">
      <div class="form-group">
        <label for="parts-model">Modelo</label>
        <select id="parts-model" v-model="selectedModelId" :disabled="loading">
          <option value="">Todos los modelos</option>
          <option v-for="m in filteredModels" :key="m.id" :value="m.id">
            {{ m.brand }} {{ m.model }} ({{ m.yearFrom ?? '—' }}–{{ m.yearTo ?? '—' }})
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="parts-year">Año</label>
        <input
          id="parts-year"
          v-model.number="yearFilter"
          type="number"
          min="1980"
          max="2100"
          placeholder="Ej. 2023"
          :disabled="loading"
        />
      </div>
    </div>

    <!-- La compatibilidad exacta se consulta por unidad (contrato §3) -->
    <p v-if="selectedModel && !activeVehicle" class="hint" role="status">
      La compatibilidad exacta se consulta por motocicleta. Ingresa el VIN de una unidad
      <strong>{{ selectedModel.brand }} {{ selectedModel.model }}</strong> para filtrar la tabla.
    </p>
    <p
      v-else-if="selectedModel && activeVehicle && activeVehicle.modelId !== selectedModel.id"
      class="hint"
      role="status"
    >
      La tabla muestra las compatibles de la moto del VIN. Para revisar otro modelo, ingresa el VIN de esa unidad.
    </p>
    <p v-if="modelsError" class="error-text" role="alert">{{ modelsError }}</p>

    <!-- Búsqueda por código o nombre -->
    <form class="search-bar" novalidate @submit.prevent="runSearch">
      <div class="form-group grow">
        <label for="parts-search">Buscar por código o nombre</label>
        <input
          id="parts-search"
          v-model="search"
          type="search"
          maxlength="80"
          autocomplete="off"
          placeholder="Ej. FIL-ACE-150 o filtro de aceite"
          :disabled="loading"
        />
      </div>
      <button type="submit" class="btn btn-primary" :disabled="loading">
        {{ loading ? 'Buscando…' : 'Buscar' }}
      </button>
    </form>

    <p v-if="loading" class="loading-message" role="status">Consultando el inventario…</p>

    <div v-if="error" class="error-box" role="alert" data-testid="parts-error">
      <p>{{ error }}</p>
    </div>

    <!-- Tabla de refacciones (sin precios: el backend nunca los envía, §4) -->
    <div v-if="!loading && visibleRows.length > 0" class="table-wrap" data-testid="parts-table">
      <table>
        <caption class="sr-only">
          Refacciones con existencias por ubicación e indicador de stock. Sin precios.
        </caption>
        <thead>
          <tr>
            <th scope="col" :aria-sort="ariaSort('sku')">
              <button type="button" class="th-btn" @click="toggleSort('sku')">SKU</button>
            </th>
            <th scope="col" :aria-sort="ariaSort('name')">
              <button type="button" class="th-btn" @click="toggleSort('name')">Refacción</button>
            </th>
            <th scope="col">Categoría</th>
            <th scope="col" :aria-sort="ariaSort('stock')">
              <button type="button" class="th-btn" @click="toggleSort('stock')">Existencias</button>
            </th>
            <th scope="col">Por ubicación</th>
            <th scope="col">
              <span class="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in visibleRows" :key="row.id">
            <tr>
              <td class="mono">{{ row.sku }}</td>
              <td>
                <span class="part-name">{{ row.name }}</span>
                <span v-if="row.brand" class="muted">{{ row.brand }}</span>
              </td>
              <td>{{ row.category?.name ?? '—' }}</td>
              <td>
                <span v-if="row.stockLevel" class="badge" :class="levelClass(row.stockLevel)">
                  {{ levelLabel(row.stockLevel) }}
                </span>
                <span v-else class="muted">Por consultar</span>
                <span v-if="row.stockTotal !== undefined" class="muted">· {{ row.stockTotal }}</span>
              </td>
              <td>
                <button
                  type="button"
                  class="btn-link"
                  :aria-expanded="expanded === row.id"
                  @click="toggleStock(row)"
                >
                  {{ expanded === row.id ? 'Ocultar' : 'Ver' }}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :data-testid="`copy-sku-${row.sku}`"
                  @click="copySku(row)"
                >
                  {{ copiedSku === row.sku ? '¡Copiado!' : 'Copiar SKU' }}
                </button>
              </td>
            </tr>
            <tr v-if="expanded === row.id" class="stock-row">
              <td colspan="6">
                <p v-if="loadingStock" class="loading-message" role="status">Consultando existencias…</p>
                <div v-else-if="stockErrors[row.id]" class="error-box" role="alert">
                  <p>{{ stockErrors[row.id] }}</p>
                </div>
                <ul v-else-if="stocks[row.id]" class="locations" data-testid="stock-locations">
                  <li v-for="loc in stocks[row.id]!.locations" :key="loc.location.id">
                    <span class="loc-name">
                      {{ loc.location.name }}
                      <span class="muted">({{ loc.location.type }})</span>
                    </span>
                    <span class="qty">{{ loc.quantity }}</span>
                    <span class="badge" :class="levelClass(loc.level)">{{ levelLabel(loc.level) }}</span>
                  </li>
                </ul>
                <p v-else class="muted">Sin datos de existencias.</p>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Estado vacío -->
    <div v-else-if="!loading && error === ''" class="empty" data-testid="parts-empty">
      <template v-if="compatMode">Sin refacciones compatibles para esta moto.</template>
      <template v-else-if="appliedSearch">
        Sin resultados para “{{ appliedSearch }}”. Revisa el código o el nombre buscado.
      </template>
      <template v-else>Sin refacciones para mostrar.</template>
    </div>

    <!-- Paginación -->
    <nav v-if="!loading && total > LIMIT" class="pagination" aria-label="Paginación de refacciones">
      <button type="button" class="btn btn-secondary" :disabled="page <= 1" @click="changePage(-1)">
        ← Anterior
      </button>
      <span class="page-info">Página {{ page }} de {{ totalPages }} · {{ total }} refacciones</span>
      <button
        type="button"
        class="btn btn-secondary"
        :disabled="page >= totalPages"
        @click="changePage(1)"
      >
        Siguiente →
      </button>
    </nav>
  </section>
</template>

<style scoped>
.parts-lookup {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

h2 { margin: 0; font-size: 18px; }
.compact-title { font-size: 15px; }

.form-group { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
label { font-weight: 600; font-size: 14px; }

input,
select {
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
  background: #fff;
  color: #0b1c30;
}

input:focus-visible,
select:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
  border-color: #4f46e5;
}

#parts-vin { text-transform: uppercase; }

.vin-bar,
.search-bar {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.grow { flex: 1 1 260px; }

.filters {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.filters .form-group { flex: 1 1 200px; }

.vehicle-chip {
  margin: 0;
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  color: #166534;
  font-size: 14px;
}

.hint {
  margin: 0;
  padding: 8px 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  color: #b45309;
  font-size: 13px;
}

.muted { color: #64748b; font-size: 13px; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 13px; }

.error-text { color: #b91c1c; font-size: 12px; line-height: 1.4; }

.error-box {
  background: #fef2f2;
  color: #991b1b;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #fecaca;
}

.error-box p { margin: 0; }

.loading-message { padding: 12px 0; color: #475569; }

.empty {
  padding: 24px;
  text-align: center;
  color: #64748b;
  border: 1px dashed #e2e8f0;
  border-radius: 8px;
}

.table-wrap { overflow-x: auto; }

table { width: 100%; border-collapse: collapse; }

th,
td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  font-size: 14px;
  vertical-align: top;
}

th { background: #f8fafc; font-size: 13px; }

.th-btn {
  background: none;
  border: none;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.th-btn:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }

.part-name { display: block; font-weight: 600; }

.stock-row td { background: #f8fafc; }

.locations { list-style: none; padding: 0; margin: 0; }

.locations li {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 6px 0;
}

.loc-name { flex: 1 1 200px; }
.qty { font-weight: 600; }

.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
}

.badge-green { background: #ecfdf5; color: #047857; border-color: #bbf7d0; }
.badge-amber { background: #fffbeb; color: #b45309; border-color: #fde68a; }
.badge-red { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }

.btn {
  padding: 10px 16px;
  border-radius: 6px;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  font: inherit;
  transition: background 0.2s;
}

.btn:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }

.btn-primary { background: #4f46e5; color: #fff; }
.btn-primary:hover { background: #4338ca; }
.btn-primary:disabled { background: #a5b4fc; cursor: not-allowed; }

.btn-secondary { background: #fff; color: #1e293b; border-color: #cbd5e1; }
.btn-secondary:hover { background: #f8fafc; }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-sm { padding: 6px 10px; font-size: 13px; }

.btn-link {
  background: none;
  border: none;
  color: #4f46e5;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  padding: 2px 4px;
}

.btn-link:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.page-info { color: #475569; font-size: 14px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 768px) {
  .vin-bar,
  .search-bar { flex-direction: column; align-items: stretch; }
  .btn { width: 100%; box-sizing: border-box; }
  .locations li { flex-direction: column; align-items: flex-start; gap: 4px; }
}
</style>