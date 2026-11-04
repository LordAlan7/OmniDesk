<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { formatDateTimeWithZone } from '@/services/audit'
import {
  approveAiSource,
  listAiSources,
  rejectAiSource,
  requestAiSource,
  revokeAiSource,
  type AiSourceAuthorization,
  type AiSourceType,
  type AuthorizationStatus,
} from '@/services/aiSources'

const session = useSessionStore()
const canRequest = computed(() => session.can('ai:sources:request'))
const canReview = computed(() => session.can('ai:sources:review'))

const items = ref<AiSourceAuthorization[]>([])
const status = ref<AuthorizationStatus | ''>('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')

const sourceType = ref<AiSourceType>('article')
const sourceId = ref('')

const statusLabels: Record<AuthorizationStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  revoked: 'Retirada',
  invalidated: 'Invalidada',
}

const reasonLabels: Record<string, string> = {
  version_changed: 'La fuente cambió de versión',
  source_not_eligible: 'La fuente dejó de estar aprobada/publicada',
  source_unavailable: 'La fuente ya no existe',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await listAiSources(status.value || undefined)
  } catch (cause) {
    items.value = []
    error.value = cause instanceof Error ? cause.message : 'No se pudieron cargar las fuentes.'
  } finally {
    loading.value = false
  }
}

async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo completar la acción.'
  } finally {
    busy.value = false
  }
}

function submitRequest() {
  const id = Number(sourceId.value)
  if (!Number.isInteger(id) || id <= 0) {
    error.value = 'Indica el ID de la fuente.'
    return
  }
  void run(async () => {
    await requestAiSource(sourceType.value, id)
    sourceId.value = ''
  })
}

function approve(item: AiSourceAuthorization) {
  const note = window.prompt('Nota de aprobación (opcional):') ?? undefined
  void run(() => approveAiSource(item.id, note?.trim() || undefined))
}

function reject(item: AiSourceAuthorization) {
  const note = window.prompt('Motivo del rechazo (obligatorio):')?.trim()
  if (note) void run(() => rejectAiSource(item.id, note))
}

function revoke(item: AiSourceAuthorization) {
  const reason = window.prompt('Motivo del retiro (obligatorio):')?.trim()
  if (reason) void run(() => revokeAiSource(item.id, reason))
}

onMounted(load)
</script>

<template>
  <section class="card" :aria-busy="loading" data-testid="ai-sources-view">
    <h1>Fuentes autorizadas para IA</h1>
    <p class="hint">
      Estar en la biblioteca no autoriza una fuente para el asistente. Cada versión debe aprobarla una persona
      distinta de quien la propone, y el asistente solo la usa si además tú tienes permiso de lectura.
    </p>

    <form v-if="canRequest" class="request" @submit.prevent="submitRequest">
      <label>
        Tipo
        <select v-model="sourceType" :disabled="busy">
          <option value="article">Artículo</option>
          <option value="document">Documento / manual</option>
        </select>
      </label>
      <label>
        ID de la fuente
        <input v-model="sourceId" type="number" min="1" :disabled="busy" />
      </label>
      <button :disabled="busy">Proponer versión vigente</button>
    </form>

    <div class="filters">
      <label>
        Estado
        <select v-model="status" :disabled="loading" @change="load">
          <option value="">Todos</option>
          <option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">Cargando…</p>
    <p v-else-if="items.length === 0">No hay fuentes con este estado.</p>

    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Fuente</th>
            <th scope="col">Versión</th>
            <th scope="col">Estado</th>
            <th scope="col">Ingesta</th>
            <th scope="col">Responsables</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" data-testid="ai-source-row">
            <td>
              <strong>{{ item.title }}</strong>
              <div class="hint">{{ item.sourceType === 'article' ? 'Artículo' : 'Documento' }} #{{ item.sourceId }}</div>
            </td>
            <td>
              <code>{{ item.sourceVersion }}</code>
              <div class="hint" :title="item.contentHash">{{ item.contentHash.slice(0, 10) }}…</div>
            </td>
            <td>
              <span :class="['badge', item.status]">{{ statusLabels[item.status] }}</span>
              <div v-if="item.invalidationReason" class="hint">{{ reasonLabels[item.invalidationReason] }}</div>
              <div v-if="item.revocationReason" class="hint">{{ item.revocationReason }}</div>
            </td>
            <td>
              <span v-if="item.ingestionStatus === 'ingested'">{{ item.chunkCount }} fragmentos</span>
              <span v-else-if="item.ingestionStatus === 'failed'" class="error-text">Falló: {{ item.ingestionError }}</span>
              <span v-else class="hint">Sin ingerir</span>
            </td>
            <td class="hint">
              Propuso: usuario #{{ item.requestedBy }} · {{ formatDateTimeWithZone(item.requestedAt) }}
              <template v-if="item.reviewedBy">
                <br />Revisó: usuario #{{ item.reviewedBy }} · {{ formatDateTimeWithZone(item.reviewedAt!) }}
              </template>
            </td>
            <td class="actions">
              <template v-if="canReview && item.status === 'pending'">
                <button :disabled="busy" @click="approve(item)">Aprobar</button>
                <button class="secondary" :disabled="busy" @click="reject(item)">Rechazar</button>
              </template>
              <button v-if="canReview && item.status === 'approved'" class="secondary" :disabled="busy" @click="revoke(item)">
                Retirar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.request, .filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin: 16px 0; }
label { display: grid; gap: 4px; font-size: 14px; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 10px 8px; border-bottom: 1px solid #e4e9f1; vertical-align: top; }
.actions { display: flex; gap: 8px; }
.secondary { background: white; color: #2457d6; }
.hint { color: #5f6b7a; font-size: 13px; }
.badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #edf1fb; color: #2457d6; }
.badge.approved { background: #edf8f0; color: #1b6b36; }
.badge.rejected, .badge.revoked, .badge.invalidated { background: #fff0f0; color: #a52121; }
.error, .error-text { color: #a52121; }
.error { padding: 12px; background: #fff0f0; }
</style>
