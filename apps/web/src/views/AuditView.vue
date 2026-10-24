<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  formatDateTimeWithZone,
  getAuditCatalog,
  listAudit,
  type AuditEventInfo,
  type AuditFilters,
  type AuditRecord,
} from '@/services/audit'

const filters = reactive<AuditFilters>({
  entity: '',
  entityId: '',
  action: '',
  actorId: '',
  outcome: '',
  correlationId: '',
  from: '',
  to: '',
})

const catalog = ref<AuditEventInfo[]>([])
const records = ref<AuditRecord[]>([])
const page = ref(1)
const limit = 20
const total = ref(0)
const loading = ref(false)
const error = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const entities = computed(() => [...new Set(catalog.value.map((item) => item.entity))].sort())
const descriptions = computed(
  () => new Map(catalog.value.map((item) => [item.action, item.description])),
)

async function load() {
  if (loading.value) return
  loading.value = true
  error.value = ''

  try {
    const response = await listAudit({ ...filters, page: page.value, limit })
    records.value = response.data
    total.value = response.meta?.total ?? response.data.length
  } catch (cause) {
    records.value = []
    total.value = 0
    error.value = cause instanceof Error ? cause.message : 'No se pudo consultar la auditoría.'
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  void load()
}

function reset() {
  Object.assign(filters, {
    entity: '', entityId: '', action: '', actorId: '',
    outcome: '', correlationId: '', from: '', to: '',
  })
  search()
}

function changePage(next: number) {
  if (loading.value || next < 1 || next > totalPages.value) return
  page.value = next
  void load()
}

onMounted(async () => {
  try {
    catalog.value = await getAuditCatalog()
  } catch {
    // Los filtros por evento quedan como texto libre si el catálogo no carga.
  }
  await load()
})
</script>

<template>
  <section class="card" :aria-busy="loading" data-testid="audit-view">
    <h1>Auditoría</h1>
    <p class="hint">
      Registro de solo lectura de acciones relevantes. Las fechas se muestran en tu zona horaria.
    </p>

    <form class="filters" @submit.prevent="search">
      <label>
        Recurso
        <select v-model="filters.entity">
          <option value="">Todos</option>
          <option v-for="entity in entities" :key="entity" :value="entity">{{ entity }}</option>
        </select>
      </label>

      <label>
        ID del recurso
        <input v-model="filters.entityId" type="number" min="1" />
      </label>

      <label>
        Evento
        <select v-model="filters.action">
          <option value="">Todos</option>
          <option v-for="item in catalog" :key="item.action" :value="item.action">
            {{ item.action }}
          </option>
        </select>
      </label>

      <label>
        Actor (ID)
        <input v-model="filters.actorId" type="number" min="1" />
      </label>

      <label>
        Resultado
        <select v-model="filters.outcome">
          <option value="">Todos</option>
          <option value="applied">Aplicado</option>
          <option value="rejected">Intento fallido</option>
        </select>
      </label>

      <label>
        Correlación
        <input v-model="filters.correlationId" maxlength="100" />
      </label>

      <label>
        Desde
        <input v-model="filters.from" type="datetime-local" />
      </label>

      <label>
        Hasta
        <input v-model="filters.to" type="datetime-local" />
      </label>

      <div class="actions">
        <button :disabled="loading">Consultar</button>
        <button type="button" class="secondary" :disabled="loading" @click="reset">Limpiar</button>
      </div>
    </form>

    <p v-if="loading" role="status">Cargando…</p>
    <p v-else-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="records.length === 0">No hay eventos con estos criterios.</p>

    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Evento</th>
            <th scope="col">Recurso</th>
            <th scope="col">Actor</th>
            <th scope="col">Resultado</th>
            <th scope="col">Detalle</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in records" :key="record.id" data-testid="audit-row">
            <td>{{ formatDateTimeWithZone(record.createdAt) }}</td>
            <td>
              <strong>{{ record.action }}</strong>
              <div class="hint">{{ descriptions.get(record.action) }}</div>
            </td>
            <td>{{ record.entity }}{{ record.entityId !== null ? ` #${record.entityId}` : '' }}</td>
            <td>{{ record.actorId !== null ? `Usuario #${record.actorId}` : 'Sistema / anónimo' }}</td>
            <td>
              <span :class="['badge', record.outcome]">
                {{ record.outcome === 'applied' ? 'Aplicado' : 'Intento fallido' }}
              </span>
            </td>
            <td>
              <details>
                <summary>Ver</summary>
                <pre>{{ JSON.stringify(record.metadata, null, 2) }}</pre>
                <p v-if="record.correlationId" class="hint">Correlación: {{ record.correlationId }}</p>
              </details>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer>
      <span>{{ total }} eventos · Página {{ page }} de {{ totalPages }}</span>
      <div class="actions">
        <button :disabled="page <= 1 || loading" @click="changePage(page - 1)">Anterior</button>
        <button :disabled="page >= totalPages || loading" @click="changePage(page + 1)">Siguiente</button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  margin: 16px 0;
}
.filters label { display: grid; gap: 4px; font-size: 14px; }
.actions { display: flex; align-items: end; gap: 8px; }
.secondary { background: white; color: #2457d6; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 10px 8px; border-bottom: 1px solid #e4e9f1; vertical-align: top; }
pre { max-width: 360px; overflow-x: auto; margin: 4px 0; font-size: 12px; }
footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin-top: 16px; }
.hint { color: #5f6b7a; font-size: 13px; }
.badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.badge.applied { background: #edf8f0; color: #1b6b36; }
.badge.rejected { background: #fff0f0; color: #a52121; }
.error { padding: 12px; background: #fff0f0; color: #a52121; }
</style>
