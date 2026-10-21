<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError } from '../services/api'
import {
  clearSession,
  hasPermission,
  sessionUser,
} from '../services/session'
import {
  assignTechnician,
  getCategories,
  changeTicketCategory,
  updateBusinessInformation,
  type Category,
  getEligibleTechnicians,
  getTicket,
  getTicketHistory,
  type TechnicianCandidate,
  type Ticket,
  type TicketHistoryEntry,
} from '../services/tickets'

const route = useRoute()
const router = useRouter()

const ticket = ref<Ticket | null>(null)
const candidates = ref<TechnicianCandidate[]>([])
const history = ref<TicketHistoryEntry[]>([])

const loading = ref(false)
const saving = ref(false)
const editing = ref(false)
const loadingCandidates = ref(false)

const selectedId = ref<number | ''>('')
const reason = ref('')
const error = ref('')
const actionError = ref('')
const historyError = ref('')
const success = ref('')

const categories = ref<Category[]>([])
const categoryId = ref(0)
const storeLocation = ref('')
const motorcycleModel = ref('')
const editingInformation = ref(false)
const informationError = ref('')
const informationSuccess = ref('')
const loadingInformation = ref(false)
const canEditInformation = computed(() =>
  !!ticket.value && ticket.value.status !== 'Closed' &&
  (sessionUser.value?.roles.some(role => role === 'Service Advisor' || role === 'Manager') ?? false),
)

async function openInformation() {
  if (!ticket.value || saving.value || loadingInformation.value || !canEditInformation.value) return
  const sequence = loadSequence
  loadingInformation.value = true
  informationError.value = ''
  informationSuccess.value = ''
  try {
    const result = await getCategories()
    if (sequence !== loadSequence || !ticket.value) return
    categories.value = result.data
    categoryId.value = ticket.value.categoryId
    storeLocation.value = ticket.value.storeLocation ?? ''
    motorcycleModel.value = ticket.value.motorcycleModel ?? ''
    editingInformation.value = true
  } catch (cause) {
    if (sequence !== loadSequence || await handleAccessError(cause)) return
    informationError.value = cause instanceof Error ? cause.message : 'No se pudieron cargar las categorías.'
  } finally {
    loadingInformation.value = false
  }
}

async function saveInformation(kind: 'category' | 'business') {
  if (!ticket.value || saving.value || !canEditInformation.value) return
  informationError.value = ''
  informationSuccess.value = ''
  if (kind === 'category' && !categories.value.some(item => item.id === categoryId.value)) {
    informationError.value = 'Selecciona una categoría válida.'
    return
  }
  if (kind === 'business' && (!storeLocation.value.trim() || !motorcycleModel.value.trim())) {
    informationError.value = 'La tienda y el modelo son obligatorios.'
    return
  }
  const sequence = loadSequence
  const current = ticket.value
  saving.value = true
  let committed = false
  try {
    if (kind === 'category') {
      await changeTicketCategory(current.id, categoryId.value)
    } else {
      await updateBusinessInformation(current.id, {
        storeLocation: storeLocation.value.trim(),
        motorcycleModel: motorcycleModel.value.trim(),
        version: current.version,
      })
    }
    committed = true
    const refreshed = await getTicket(current.id)
    if (sequence !== loadSequence) return
    ticket.value = refreshed
    editingInformation.value = false
    informationSuccess.value = 'Cambio guardado correctamente.'
    await loadHistory(current.id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence || await handleAccessError(cause)) return
    if (cause instanceof ApiError && cause.status === 409) {
      await loadTicket()
      informationError.value = 'El ticket cambió. Revisa los datos actuales y vuelve a editar.'
    } else if (committed) {
      editingInformation.value = false
      ticket.value = null
      error.value = 'El cambio se guardó, pero no se pudo actualizar el detalle. Pulsa Reintentar.'
    } else {
      informationError.value = cause instanceof Error ? cause.message : 'No se pudo guardar el cambio.'
    }
  } finally {
    saving.value = false
  }
}

let loadSequence = 0

const canAssign = computed(() =>
  hasPermission('tickets:assign') &&
  !!ticket.value &&
  ['Open', 'Assigned'].includes(ticket.value.status),
)

const canReadHistory = computed(() =>
  hasPermission('tickets:history:read'),
)

const selectedTechnician = computed(() =>
  candidates.value.find(
    (item) => item.id === selectedId.value,
  ),
)

const alternatives = computed(() =>
  candidates.value.filter(
    (item) =>
      item.id !== ticket.value?.assignedTechnicianId,
  ),
)

function technicianLabel(id: number | null): string {
  if (id === null) return 'Sin asignar'

  if (
    id === ticket.value?.assignedTechnicianId &&
    ticket.value?.assignedTechnicianName
  ) {
    return ticket.value.assignedTechnicianName
  }

  if (id === sessionUser.value?.id) {
    return sessionUser.value.name
  }

  return candidates.value.find((item) => item.id === id)?.name
    ?? `Técnico #${id}`
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    Open: 'Abierto',
    Assigned: 'Asignado',
    'In Progress': 'En progreso',
    Resolved: 'Resuelto',
    Closed: 'Cerrado',
  }

  return labels[value] ?? value
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-MX')
}

function historyDescription(
  entry: TicketHistoryEntry,
): string {
  if (entry.action === 'assigned') {
    const previous = typeof entry.from === 'number'
      ? technicianLabel(entry.from)
      : 'Sin asignar'

    const next = typeof entry.to === 'number'
      ? technicianLabel(entry.to)
      : 'Sin asignar'

    return `${previous} → ${next}`
  }

  if (entry.action === 'created') {
    return 'Ticket creado'
  }

  if (entry.action === 'status_changed') {
    return `Estado: ${statusLabel(String(entry.from))} → ${statusLabel(String(entry.to))}`
  }

  const labels: Record<string, string> = {
    updated: 'Ticket actualizado',
    priority_changed: 'Prioridad modificada',
    closed_comment: 'Comentario de cierre',
  }

  return labels[entry.action] ?? entry.action
}

async function handleAccessError(
  cause: unknown,
): Promise<boolean> {
  if (!(cause instanceof ApiError)) return false

  if (cause.status === 401) {
    ticket.value = null
    history.value = []
    candidates.value = []
    clearSession()
    await router.replace('/login')
    return true
  }

  if (cause.status === 403 || cause.status === 404) {
    ticket.value = null
    history.value = []
    candidates.value = []
    editing.value = false
    error.value = cause.message
    return true
  }

  return false
}

async function loadHistory(
  id: number,
  sequence: number,
) {
  historyError.value = ''

  if (!canReadHistory.value) {
    history.value = []
    return
  }

  try {
    const result = await getTicketHistory(id)

    if (sequence === loadSequence) {
      history.value = result
    }
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    historyError.value = cause instanceof Error
      ? cause.message
      : 'No se pudo cargar el historial.'
  }
}

async function loadTicket() {
  const sequence = ++loadSequence
  const id = Number(route.params.id)

  editingInformation.value = false
  informationError.value = ''
  informationSuccess.value = ''
  ticket.value = null
  history.value = []
  candidates.value = []
  selectedId.value = ''
  reason.value = ''
  editing.value = false
  error.value = ''
  actionError.value = ''
  success.value = ''
  historyError.value = ''
  loading.value = true

  try {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(
        'El identificador del ticket no es válido.',
      )
    }

    const result = await getTicket(id)

    if (sequence !== loadSequence) return

    if (!('version' in result)) {
      await router.replace(`/my-tickets/${id}`)
      return
    }
    ticket.value = result
    await loadHistory(id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    error.value = cause instanceof Error
      ? cause.message
      : 'No se pudo cargar el ticket.'
  } finally {
    if (sequence === loadSequence) {
      loading.value = false
    }
  }
}

async function openAssignment() {
  if (
    !ticket.value ||
    !canAssign.value ||
    loadingCandidates.value ||
    saving.value
  ) {
    return
  }

  const id = ticket.value.id
  const sequence = loadSequence

  loadingCandidates.value = true
  actionError.value = ''
  success.value = ''
  selectedId.value = ''
  reason.value = ''

  try {
    const result = await getEligibleTechnicians(id)

    if (sequence !== loadSequence) return

    candidates.value = result
    editing.value = true
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    actionError.value = cause instanceof Error
      ? cause.message
      : 'No se pudieron consultar los técnicos.'
  } finally {
    loadingCandidates.value = false
  }
}

function cancelAssignment() {
  if (saving.value) return

  editing.value = false
  selectedId.value = ''
  reason.value = ''
  actionError.value = ''
}

async function saveAssignment() {
  if (
    !ticket.value ||
    !canAssign.value ||
    saving.value ||
    !selectedTechnician.value
  ) {
    return
  }

  const confirmed = window.confirm(
    `¿Confirmas asignar el ticket #${ticket.value.id} a ${selectedTechnician.value.name}?`,
  )

  if (!confirmed) return

  const sequence = loadSequence
  saving.value = true
  actionError.value = ''
  success.value = ''

  try {
    const saved = await assignTechnician(
      ticket.value.id,
      {
        technicianId: selectedTechnician.value.id,
        expectedVersion: ticket.value.version,
        ...(reason.value.trim()
          ? { reason: reason.value.trim() }
          : {}),
      },
    )

    if (sequence !== loadSequence) return

    ticket.value = saved
    editing.value = false
    selectedId.value = ''
    reason.value = ''
    success.value = 'Asignación guardada correctamente.'

    await loadHistory(saved.id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    if (
      cause instanceof ApiError &&
      cause.status === 409
    ) {
      await loadTicket()

      actionError.value =
        'No se guardó el cambio. Revisa el responsable y estado actuales antes de volver a intentar.'

      return
    }

    actionError.value = cause instanceof Error
      ? cause.message
      : 'No se pudo guardar la asignación.'
  } finally {
    saving.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    void loadTicket()
  },
  { immediate: true },
)
</script>

<template>
  <main class="detail-page">
    <div class="container">
      <RouterLink to="/tickets">
        ← Volver a tickets
      </RouterLink>

      <p v-if="loading" role="status">
        Cargando ticket…
      </p>

      <p
        v-if="error"
        class="error"
        role="alert"
      >
        {{ error }}
      </p>

      <template v-if="ticket && !loading">
        <header>
          <span class="brand">
            OmniDesk · Ticket #{{ ticket.id }}
          </span>

          <h1>{{ ticket.title }}</h1>

          <p>
            Estado:
            <span class="badge">
              {{ statusLabel(ticket.status) }}
            </span>
          </p>
        </header>

        <section class="card">
          <h2>Descripción</h2>

          <p class="description">
            {{ ticket.description }}
          </p>

          <p>
            Creado: {{ formatDate(ticket.createdAt) }}
          </p>

          <p>
            Plazo:
            {{
              ticket.dueDate
                ? formatDate(ticket.dueDate)
                : 'Sin definir'
            }}
          </p>
        </section>

        <section class="card" :aria-busy="saving || loadingInformation">
          <h2>Clasificación e información comercial</h2>
          <p>Categoría: {{ categories.find(item => item.id === ticket?.categoryId)?.name ?? `#${ticket.categoryId}` }}</p>
          <p>Tienda o ubicación: {{ ticket.storeLocation || 'Sin registrar' }}</p>
          <p>Modelo de motocicleta: {{ ticket.motorcycleModel || 'Sin registrar' }}</p>
          <p v-if="informationError" class="error" role="alert">{{ informationError }}</p>
          <p v-if="informationSuccess" class="success" role="status">{{ informationSuccess }}</p>
          <button v-if="canEditInformation && !editingInformation" :disabled="saving || loadingInformation" @click="openInformation">
            {{ loadingInformation ? 'Cargando…' : 'Editar clasificación e información' }}
          </button>
          <template v-if="editingInformation && canEditInformation">
            <form @submit.prevent="saveInformation('category')">
              <label for="ticket-category">Categoría</label>
              <select id="ticket-category" v-model="categoryId" required :disabled="saving">
                <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
              </select>
              <button :disabled="saving || categoryId === ticket.categoryId">Guardar categoría</button>
            </form>
            <form @submit.prevent="saveInformation('business')">
              <label for="ticket-store">Tienda o ubicación *</label>
              <input id="ticket-store" v-model="storeLocation" required maxlength="200" :disabled="saving" />
              <label for="ticket-model">Modelo de motocicleta *</label>
              <input id="ticket-model" v-model="motorcycleModel" required maxlength="200" :disabled="saving" />
              <button :disabled="saving">Guardar información comercial</button>
            </form>
            <button class="secondary" :disabled="saving" @click="editingInformation = false">Cancelar</button>
          </template>
        </section>

        <section
          class="card"
          :aria-busy="saving || loadingCandidates"
        >
          <h2>Técnico asignado</h2>

          <p class="responsible">
            {{ technicianLabel(ticket.assignedTechnicianId) }}
          </p>

          <p
            v-if="success"
            class="success"
            role="status"
          >
            {{ success }}
          </p>

          <p
            v-if="actionError"
            class="error"
            role="alert"
          >
            {{ actionError }}
          </p>

          <p v-if="loadingCandidates" role="status">
            Consultando técnicos…
          </p>

          <button
            v-if="canAssign && !editing"
            :disabled="loadingCandidates || saving"
            @click="openAssignment"
          >
            {{
              ticket.assignedTechnicianId === null
                ? 'Asignar técnico'
                : 'Reasignar técnico'
            }}
          </button>

          <form
            v-if="editing && canAssign"
            @submit.prevent="saveAssignment"
          >
            <p
              v-if="alternatives.length === 0"
              role="status"
            >
              No hay otros técnicos elegibles para esta
              operación. La asignación actual se conserva.
            </p>

            <template v-else>
              <label for="technician">
                Nuevo responsable
              </label>

              <select
                id="technician"
                v-model="selectedId"
                required
                :disabled="saving"
              >
                <option disabled value="">
                  Selecciona un técnico
                </option>

                <option
                  v-for="candidate in alternatives"
                  :key="candidate.id"
                  :value="candidate.id"
                >
                  {{ candidate.name }}
                </option>
              </select>

              <label for="assignment-reason">
                Motivo (opcional)
              </label>

              <textarea
                id="assignment-reason"
                v-model="reason"
                maxlength="1000"
                rows="3"
                :disabled="saving"
              />

              <p v-if="selectedTechnician">
                Nuevo responsable:
                <strong>
                  {{ selectedTechnician.name }}
                </strong>
              </p>

              <button
                type="submit"
                :disabled="saving || !selectedTechnician"
              >
                {{
                  saving
                    ? 'Guardando…'
                    : 'Confirmar asignación'
                }}
              </button>
            </template>

            <button
              type="button"
              class="secondary"
              :disabled="saving"
              @click="cancelAssignment"
            >
              Cancelar
            </button>
          </form>
        </section>

        <section
          v-if="canReadHistory"
          class="card"
        >
          <h2>Historial del ticket</h2>

          <p
            v-if="historyError"
            class="error"
            role="alert"
          >
            {{ historyError }}
          </p>

          <p v-else-if="history.length === 0">
            Sin eventos registrados.
          </p>

          <ol v-else>
            <li
              v-for="entry in history"
              :key="entry.id"
            >
              <strong>
                {{ historyDescription(entry) }}
              </strong>

              <p>
                {{ formatDate(entry.createdAt) }}
                · Usuario #{{ entry.actorId }}
              </p>

              <p v-if="entry.reason">
                Motivo: {{ entry.reason }}
              </p>
            </li>
          </ol>
        </section>
      </template>

      <button
        v-if="error && !loading"
        @click="loadTicket"
      >
        Reintentar
      </button>
    </div>
  </main>
</template>

<style scoped>
.detail-page {
  min-height: 100vh;
  padding: 32px;
  background: #f8f9ff;
  color: #182338;
  font-family: Arial, sans-serif;
}

.container {
  max-width: 1000px;
  margin: auto;
}

header {
  margin: 28px 0;
}

.brand,
a {
  color: #2457d6;
}

.brand {
  font-weight: 700;
}

h1 {
  overflow-wrap: anywhere;
}

.card {
  padding: 24px;
  margin-bottom: 20px;
  border: 1px solid #dce3ee;
  border-radius: 14px;
  background: white;
}

h2 {
  margin-top: 0;
}

.description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.responsible {
  font-size: 20px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.badge {
  display: inline-block;
  padding: 5px 10px;
  border-radius: 20px;
  background: #edf1fb;
  color: #2457d6;
}

form {
  display: grid;
  gap: 12px;
  max-width: 600px;
  margin-top: 18px;
}

label {
  font-weight: 600;
}

input,
select,
textarea,
button {
  padding: 11px 14px;
  border-radius: 8px;
  font: inherit;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #b7c3d4;
  background: white;
  color: #182338;
}

textarea {
  resize: vertical;
}

button {
  border: 1px solid #2457d6;
  background: #2457d6;
  color: white;
  cursor: pointer;
}

button.secondary {
  background: white;
  color: #2457d6;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

.error,
.success {
  padding: 14px;
  border-radius: 8px;
  overflow-wrap: anywhere;
}

.error {
  background: #fff0f0;
  color: #a52121;
}

.success {
  background: #e7f6ed;
  color: #17663a;
}

ol {
  padding-left: 24px;
}

li {
  padding: 12px 0;
  border-bottom: 1px solid #e4e9f1;
}

li p {
  color: #5f6b7a;
  overflow-wrap: anywhere;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
a:focus-visible {
  outline: 2px solid #2457d6;
  outline-offset: 3px;
}

@media (max-width: 600px) {
  .detail-page {
    padding: 16px;
  }

  .card {
    padding: 18px;
  }
}
</style>
