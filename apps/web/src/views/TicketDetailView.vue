
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
  getEligibleTechnicians,
  getTicket,
  getTicketHistory,
  changeTicketStatus,
  resolveTicket,
  updateTicketPriority,
  TICKET_PRIORITIES,
  type Category,
  type TechnicianCandidate,
  type Ticket,
  type TicketHistoryEntry,
} from '../services/tickets'

const route = useRoute()
const router = useRouter()

const ticket = ref<Ticket | null>(null)
const candidates = ref<TechnicianCandidate[]>([])
const history = ref<TicketHistoryEntry[]>([])

// Estados generales
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

// Clasificación e información comercial
const categories = ref<Category[]>([])
const categoryId = ref(0)
const storeLocation = ref('')
const motorcycleModel = ref('')
const editingInformation = ref(false)
const informationError = ref('')
const informationSuccess = ref('')
const loadingInformation = ref(false)

// Acciones del técnico
const resolutionText = ref('')
const technicianError = ref('')
const technicianSuccess = ref('')
const technicianSaving = ref(false)

// NFR-006: prioridades del gerente
const editingPriority = ref(false)
const selectedPriority = ref<number | ''>('')
const prioritySaving = ref(false)
const priorityError = ref('')
const prioritySuccess = ref('')

let loadSequence = 0

const isBusy = computed(() =>
  saving.value ||
  technicianSaving.value ||
  prioritySaving.value,
)

const canEditInformation = computed(() =>
  !!ticket.value &&
  ticket.value.status !== 'Closed' &&
  (
    sessionUser.value?.roles.some(
      role =>
        role === 'Service Advisor' ||
        role === 'Manager',
    ) ?? false
  ),
)

const canAssign = computed(() =>
  !!ticket.value &&
  hasPermission('tickets:assign') &&
  ['Open', 'Assigned'].includes(ticket.value.status),
)

const canReadHistory = computed(() =>
  hasPermission('tickets:history:read'),
)

const canManagePriority = computed(() =>
  !!ticket.value &&
  hasPermission('tickets:priority:update'),
)

const isAssignedTechnicianOrStaff = computed(() =>
  !!ticket.value &&
  (
    ticket.value.assignedTechnicianId ===
      sessionUser.value?.id ||
    hasPermission('tickets:read:all')
  ),
)

const canStartWork = computed(() =>
  !!ticket.value &&
  ticket.value.status === 'Assigned' &&
  hasPermission('tickets:status:update') &&
  isAssignedTechnicianOrStaff.value,
)

const canReopenWork = computed(() =>
  !!ticket.value &&
  ticket.value.status === 'Resolved' &&
  hasPermission('tickets:status:update') &&
  isAssignedTechnicianOrStaff.value,
)

const canResolve = computed(() =>
  !!ticket.value &&
  ticket.value.status === 'In Progress' &&
  hasPermission('tickets:resolve') &&
  isAssignedTechnicianOrStaff.value,
)

const selectedTechnician = computed(() =>
  candidates.value.find(
    item => item.id === selectedId.value,
  ),
)

const alternatives = computed(() =>
  candidates.value.filter(
    item =>
      item.id !== ticket.value?.assignedTechnicianId,
  ),
)

const priorityOptions = TICKET_PRIORITIES

function priorityLabel(
  id: number | null | undefined,
): string {
  if (id == null) return 'Sin prioridad asignada'

  return (
    priorityOptions.find(item => item.id === id)?.name ??
    `Prioridad #${id}`
  )
}

function technicianLabel(
  id: number | null,
): string {
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

  return (
    candidates.value.find(item => item.id === id)?.name ??
    `Técnico #${id}`
  )
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
  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime())
    ? 'Fecha no disponible'
    : parsed.toLocaleString('es-MX')
}

function historyDescription(
  entry: TicketHistoryEntry,
): string {
  if (entry.action === 'assigned') {
    const previous =
      typeof entry.from === 'number'
        ? technicianLabel(entry.from)
        : 'Sin asignar'

    const next =
      typeof entry.to === 'number'
        ? technicianLabel(entry.to)
        : 'Sin asignar'

    return `${previous} → ${next}`
  }

  if (entry.action === 'created') {
    return 'Ticket creado'
  }

  if (entry.action === 'status_changed') {
    return (
      `Estado: ${statusLabel(String(entry.from))}` +
      ` → ${statusLabel(String(entry.to))}`
    )
  }

  if (entry.action === 'priority_changed') {
    return (
      `Prioridad: ${priorityLabel(
        typeof entry.from === 'number'
          ? entry.from
          : null,
      )} → ${priorityLabel(
        typeof entry.to === 'number'
          ? entry.to
          : null,
      )}`
    )
  }

  const labels: Record<string, string> = {
    updated: 'Ticket actualizado',
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
    editingPriority.value = false
    editingInformation.value = false
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

    historyError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo cargar el historial.'
  }
}

async function loadTicket() {
  const sequence = ++loadSequence
  const id = Number(route.params.id)

  ticket.value = null
  history.value = []
  candidates.value = []

  editing.value = false
  editingInformation.value = false
  editingPriority.value = false

  selectedId.value = ''
  selectedPriority.value = ''
  reason.value = ''
  resolutionText.value = ''

  error.value = ''
  actionError.value = ''
  historyError.value = ''
  success.value = ''

  informationError.value = ''
  informationSuccess.value = ''
  technicianError.value = ''
  technicianSuccess.value = ''
  priorityError.value = ''
  prioritySuccess.value = ''

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
    selectedPriority.value = result.priorityId ?? ''

    await loadHistory(id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    error.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo cargar el ticket.'
  } finally {
    if (sequence === loadSequence) {
      loading.value = false
    }
  }
}

// Clasificación e información comercial
async function openInformation() {
  if (
    !ticket.value ||
    isBusy.value ||
    loadingInformation.value ||
    !canEditInformation.value
  ) return

  const sequence = loadSequence

  loadingInformation.value = true
  informationError.value = ''
  informationSuccess.value = ''

  try {
    const result = await getCategories()

    if (
      sequence !== loadSequence ||
      !ticket.value
    ) return

    categories.value = result.data
    categoryId.value = ticket.value.categoryId
    storeLocation.value =
      ticket.value.storeLocation ?? ''
    motorcycleModel.value =
      ticket.value.motorcycleModel ?? ''

    editingInformation.value = true
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    informationError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudieron cargar las categorías.'
  } finally {
    loadingInformation.value = false
  }
}

async function saveInformation(
  kind: 'category' | 'business',
) {
  if (
    !ticket.value ||
    isBusy.value ||
    !canEditInformation.value
  ) return

  informationError.value = ''
  informationSuccess.value = ''

  if (
    kind === 'category' &&
    !categories.value.some(
      item => item.id === categoryId.value,
    )
  ) {
    informationError.value =
      'Selecciona una categoría válida.'
    return
  }

  if (
    kind === 'business' &&
    (
      !storeLocation.value.trim() ||
      !motorcycleModel.value.trim()
    )
  ) {
    informationError.value =
      'La tienda y el modelo son obligatorios.'
    return
  }

  const current = ticket.value

  const message =
    kind === 'category'
      ? `¿Confirmas cambiar la categoría del ticket #${current.id}?`
      : `¿Confirmas actualizar la información comercial del ticket #${current.id}?`

  if (!window.confirm(message)) return

  const sequence = loadSequence
  saving.value = true
  let committed = false

  try {
    if (kind === 'category') {
      await changeTicketCategory(
        current.id,
        categoryId.value,
      )
    } else {
      await updateBusinessInformation(
        current.id,
        {
          storeLocation: storeLocation.value.trim(),
          motorcycleModel: motorcycleModel.value.trim(),
          version: current.version,
        },
      )
    }

    committed = true

    const refreshed = await getTicket(current.id)

    if (sequence !== loadSequence) return

    ticket.value = refreshed
    editingInformation.value = false
    informationSuccess.value =
      'Cambio guardado correctamente.'

    await loadHistory(current.id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    if (
      cause instanceof ApiError &&
      cause.status === 409
    ) {
      informationError.value =
        'El ticket cambió. Actualiza la página y vuelve a intentarlo.'
    } else if (committed) {
      informationError.value =
        'Se guardó el cambio, pero no fue posible actualizar el detalle. Utiliza Reintentar.'
    } else {
      informationError.value =
        cause instanceof Error
          ? cause.message
          : 'No se pudo guardar el cambio.'
    }
  } finally {
    saving.value = false
  }
}

// Asignación y reasignación
async function openAssignment() {
  if (
    !ticket.value ||
    !canAssign.value ||
    loadingCandidates.value ||
    isBusy.value
  ) return

  const sequence = loadSequence

  loadingCandidates.value = true
  actionError.value = ''
  success.value = ''
  selectedId.value = ''
  reason.value = ''

  try {
    const result = await getEligibleTechnicians(
      ticket.value.id,
    )

    if (sequence !== loadSequence) return

    candidates.value = result
    editing.value = true
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    actionError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudieron consultar los técnicos.'
  } finally {
    loadingCandidates.value = false
  }
}

function cancelAssignment() {
  if (isBusy.value) return

  editing.value = false
  selectedId.value = ''
  reason.value = ''
  actionError.value = ''
}

async function saveAssignment() {
  if (
    !ticket.value ||
    !canAssign.value ||
    isBusy.value ||
    !selectedTechnician.value
  ) return

  const current = ticket.value
  const technician = selectedTechnician.value

  if (
    !window.confirm(
      `¿Confirmas asignar el ticket #${current.id} a ${technician.name}?`,
    )
  ) return

  const sequence = loadSequence

  saving.value = true
  actionError.value = ''
  success.value = ''

  try {
    const saved = await assignTechnician(
      current.id,
      {
        technicianId: technician.id,
        expectedVersion: current.version,
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

    success.value =
      'Asignación guardada correctamente.'

    await loadHistory(saved.id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    actionError.value =
      cause instanceof ApiError &&
      cause.status === 409
        ? 'El ticket cambió. Actualiza la página antes de volver a asignarlo.'
        : cause instanceof Error
          ? cause.message
          : 'No se pudo guardar la asignación.'
  } finally {
    saving.value = false
  }
}

// NFR-006: iniciar y reabrir trabajo
async function updateWorkStatus() {
  if (
    !ticket.value ||
    isBusy.value ||
    (!canStartWork.value && !canReopenWork.value)
  ) return

  const id = ticket.value.id

  if (
    !window.confirm(
      `¿Confirmas cambiar el ticket #${id} a En progreso?`,
    )
  ) return

  const sequence = loadSequence

  technicianSaving.value = true
  technicianError.value = ''
  technicianSuccess.value = ''

  try {
    const updated = await changeTicketStatus(
      id,
      'In Progress',
    )

    if (sequence !== loadSequence) return

    ticket.value = updated
    technicianSuccess.value =
      'El ticket se encuentra ahora en progreso.'

    await loadHistory(id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    technicianError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo actualizar el estado.'
  } finally {
    technicianSaving.value = false
  }
}

// NFR-006: registrar resolución
async function submitResolution() {
  if (
    !ticket.value ||
    !canResolve.value ||
    isBusy.value
  ) return

  const text = resolutionText.value.trim()

  if (text.length < 5 || text.length > 5000) {
    technicianError.value =
      'La resolución debe contener entre 5 y 5000 caracteres.'
    return
  }

  const id = ticket.value.id

  if (
    !window.confirm(
      `¿Confirmas registrar la resolución del ticket #${id}?`,
    )
  ) return

  const sequence = loadSequence

  technicianSaving.value = true
  technicianError.value = ''
  technicianSuccess.value = ''

  try {
    const updated = await resolveTicket(id, text)

    if (sequence !== loadSequence) return

    ticket.value = updated
    resolutionText.value = ''

    technicianSuccess.value =
      'La resolución se registró correctamente.'

    await loadHistory(id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    technicianError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo registrar la resolución.'
  } finally {
    technicianSaving.value = false
  }
}

// NFR-006: edición de prioridad del gerente
function openPriorityEditor() {
  if (
    !ticket.value ||
    !canManagePriority.value ||
    isBusy.value
  ) return

  selectedPriority.value =
    ticket.value.priorityId ?? ''

  priorityError.value = ''
  prioritySuccess.value = ''
  editingPriority.value = true
}

function cancelPriorityEditor() {
  if (prioritySaving.value) return

  editingPriority.value = false
  priorityError.value = ''
  selectedPriority.value =
    ticket.value?.priorityId ?? ''
}

async function savePriority() {
  if (
    !ticket.value ||
    !canManagePriority.value ||
    isBusy.value
  ) return

  priorityError.value = ''
  prioritySuccess.value = ''

  const newPriority = selectedPriority.value

  if (
    typeof newPriority !== 'number' ||
    !priorityOptions.some(
      item => item.id === newPriority,
    )
  ) {
    priorityError.value =
      'Selecciona una prioridad válida.'
    return
  }

  const current = ticket.value

  if (newPriority === current.priorityId) {
    priorityError.value =
      'Selecciona una prioridad diferente a la actual.'
    return
  }

  const confirmed = window.confirm(
    `¿Confirmas cambiar la prioridad del ticket #${current.id} de ${priorityLabel(current.priorityId)} a ${priorityLabel(newPriority)}?`,
  )

  if (!confirmed) return

  const sequence = loadSequence

  prioritySaving.value = true

  try {
    const updated = await updateTicketPriority(
      current.id,
      newPriority,
    )

    if (sequence !== loadSequence) return

    ticket.value = updated
    selectedPriority.value =
      updated.priorityId ?? ''

    editingPriority.value = false
    prioritySuccess.value =
      `Prioridad actualizada correctamente a ${priorityLabel(updated.priorityId)}.`

    await loadHistory(updated.id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    priorityError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo actualizar la prioridad.'
  } finally {
    prioritySaving.value = false
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
      <RouterLink
        to="/tickets"
        class="back-link"
      >
        ← Volver a tickets
      </RouterLink>

      <p v-if="loading" role="status">
        Cargando ticket...
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

        <!-- Información del ticket -->
        <section class="card">
          <h2>Descripción</h2>

          <p class="description">
            {{ ticket.description }}
          </p>

          <p>
            Creado:
            {{ formatDate(ticket.createdAt) }}
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

        <!-- NFR-006: prioridad del gerente -->
        <section
          class="card priority-section"
          :aria-busy="prioritySaving"
        >
          <h2>Prioridad del ticket</h2>

          <p>
            Prioridad actual:
            <strong>
              {{ priorityLabel(ticket.priorityId) }}
            </strong>
          </p>

          <p
            v-if="prioritySuccess"
            class="success"
            role="status"
          >
            {{ prioritySuccess }}
          </p>

          <p
            v-if="priorityError"
            class="error"
            role="alert"
          >
            {{ priorityError }}
          </p>

          <button
            v-if="
              canManagePriority &&
              !editingPriority
            "
            type="button"
            :disabled="isBusy"
            @click="openPriorityEditor"
          >
            Cambiar prioridad
          </button>

          <form
            v-if="
              canManagePriority &&
              editingPriority
            "
            @submit.prevent="savePriority"
          >
            <label for="ticket-priority">
              Nueva prioridad *
            </label>

            <select
              id="ticket-priority"
              v-model="selectedPriority"
              required
              :disabled="isBusy"
            >
              <option disabled value="">
                Selecciona una prioridad
              </option>

              <option
                v-for="option in priorityOptions"
                :key="option.id"
                :value="option.id"
              >
                {{ option.name }}
              </option>
            </select>

            <p class="field-help">
              Selecciona la importancia del ticket
              según su urgencia y su impacto.
            </p>

            <div class="form-actions">
              <button
                type="submit"
                :disabled="
                  isBusy ||
                  selectedPriority === '' ||
                  selectedPriority === ticket.priorityId
                "
              >
                {{
                  prioritySaving
                    ? 'Guardando...'
                    : 'Guardar prioridad'
                }}
              </button>

              <button
                type="button"
                class="secondary"
                :disabled="prioritySaving"
                @click="cancelPriorityEditor"
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>

        <!-- Clasificación e información comercial -->
        <section
          class="card"
          :aria-busy="
            saving ||
            loadingInformation
          "
        >
          <h2>
            Clasificación e información comercial
          </h2>

          <p>
            Categoría:
            {{
              categories.find(
                item =>
                  item.id === ticket?.categoryId,
              )?.name ?? `#${ticket.categoryId}`
            }}
          </p>

          <p>
            Tienda o ubicación:
            {{
              ticket.storeLocation ||
              'Sin registrar'
            }}
          </p>

          <p>
            Modelo de motocicleta:
            {{
              ticket.motorcycleModel ||
              'Sin registrar'
            }}
          </p>

          <p
            v-if="informationError"
            class="error"
            role="alert"
          >
            {{ informationError }}
          </p>

          <p
            v-if="informationSuccess"
            class="success"
            role="status"
          >
            {{ informationSuccess }}
          </p>

          <button
            v-if="
              canEditInformation &&
              !editingInformation
            "
            type="button"
            :disabled="
              isBusy ||
              loadingInformation
            "
            @click="openInformation"
          >
            {{
              loadingInformation
                ? 'Cargando...'
                : 'Editar clasificación e información'
            }}
          </button>

          <template
            v-if="
              editingInformation &&
              canEditInformation
            "
          >
            <form
              @submit.prevent="
                saveInformation('category')
              "
            >
              <label for="ticket-category">
                Categoría
              </label>

              <select
                id="ticket-category"
                v-model="categoryId"
                required
                :disabled="isBusy"
              >
                <option
                  v-for="category in categories"
                  :key="category.id"
                  :value="category.id"
                >
                  {{ category.name }}
                </option>
              </select>

              <button
                type="submit"
                :disabled="
                  isBusy ||
                  categoryId === ticket.categoryId
                "
              >
                Guardar categoría
              </button>
            </form>

            <form
              @submit.prevent="
                saveInformation('business')
              "
            >
              <label for="ticket-store">
                Tienda o ubicación *
              </label>

              <input
                id="ticket-store"
                v-model="storeLocation"
                required
                maxlength="200"
                :disabled="isBusy"
              />

              <label for="ticket-model">
                Modelo de motocicleta *
              </label>

              <input
                id="ticket-model"
                v-model="motorcycleModel"
                required
                maxlength="200"
                :disabled="isBusy"
              />

              <button
                type="submit"
                :disabled="isBusy"
              >
                Guardar información comercial
              </button>
            </form>

            <button
              type="button"
              class="secondary"
              :disabled="isBusy"
              @click="
                editingInformation = false
              "
            >
              Cancelar
            </button>
          </template>
        </section>

        <!-- Asignación de técnicos -->
        <section
          class="card"
          :aria-busy="
            saving ||
            loadingCandidates
          "
        >
          <h2>Técnico asignado</h2>

          <p class="responsible">
            {{
              technicianLabel(
                ticket.assignedTechnicianId,
              )
            }}
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

          <p
            v-if="loadingCandidates"
            role="status"
          >
            Consultando técnicos...
          </p>

          <button
            v-if="canAssign && !editing"
            type="button"
            :disabled="
              isBusy ||
              loadingCandidates
            "
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
              No hay otros técnicos elegibles.
              La asignación actual se conserva.
            </p>

            <template v-else>
              <label for="technician">
                Nuevo responsable
              </label>

              <select
                id="technician"
                v-model="selectedId"
                required
                :disabled="isBusy"
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
                maxlength="500"
                rows="3"
                :disabled="isBusy"
              ></textarea>

              <p v-if="selectedTechnician">
                Nuevo responsable:
                <strong>
                  {{ selectedTechnician.name }}
                </strong>
              </p>

              <button
                type="submit"
                :disabled="
                  isBusy ||
                  !selectedTechnician
                "
              >
                {{
                  saving
                    ? 'Guardando...'
                    : 'Confirmar asignación'
                }}
              </button>
            </template>

            <button
              type="button"
              class="secondary"
              :disabled="isBusy"
              @click="cancelAssignment"
            >
              Cancelar
            </button>
          </form>
        </section>

        <!-- NFR-006: atención del técnico -->
        <section
          v-if="
            canStartWork ||
            canReopenWork ||
            canResolve
          "
          class="card technician-actions"
          :aria-busy="technicianSaving"
        >
          <h2>Atención del ticket</h2>

          <p>
            Actualiza el avance del trabajo y
            registra la solución cuando hayas terminado.
          </p>

          <p
            v-if="technicianError"
            class="error"
            role="alert"
          >
            {{ technicianError }}
          </p>

          <p
            v-if="technicianSuccess"
            class="success"
            role="status"
          >
            {{ technicianSuccess }}
          </p>

          <button
            v-if="
              canStartWork ||
              canReopenWork
            "
            type="button"
            :disabled="isBusy"
            @click="updateWorkStatus"
          >
            {{
              technicianSaving
                ? 'Actualizando...'
                : canReopenWork
                  ? 'Reabrir trabajo'
                  : 'Iniciar trabajo'
            }}
          </button>

          <form
            v-if="canResolve"
            @submit.prevent="submitResolution"
          >
            <label for="ticket-resolution">
              Resolución del problema *
            </label>

            <p id="resolution-help">
              Describe el problema encontrado,
              las acciones realizadas y cómo se
              solucionó. Escribe entre 5 y
              5000 caracteres.
            </p>

            <textarea
              id="ticket-resolution"
              v-model="resolutionText"
              rows="5"
              minlength="5"
              maxlength="5000"
              required
              :disabled="isBusy"
              aria-describedby="resolution-help"
              placeholder="Describe cómo se solucionó el problema."
            ></textarea>

            <p class="character-count">
              {{ resolutionText.length }} /
              5000 caracteres
            </p>

            <button
              type="submit"
              :disabled="isBusy"
            >
              {{
                technicianSaving
                  ? 'Registrando resolución...'
                  : 'Registrar resolución'
              }}
            </button>
          </form>
        </section>

        <!-- Resolución registrada -->
        <section
          v-if="ticket.resolution"
          class="card"
        >
          <h2>Resolución registrada</h2>

          <p class="description">
            {{ ticket.resolution }}
          </p>

          <p v-if="ticket.resolvedAt">
            Resuelto:
            {{ formatDate(ticket.resolvedAt) }}
          </p>
        </section>

        <!-- Historial -->
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

          <p
            v-else-if="history.length === 0"
          >
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
        type="button"
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

.detail-page,
.detail-page * {
  box-sizing: border-box;
}

.container {
  max-width: 1000px;
  width: 100%;
  min-width: 0;
  margin: 0 auto;
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

.back-link {
  display: inline-block;
  margin-bottom: 10px;
  text-decoration: none;
  font-weight: 600;
}

.back-link:hover {
  text-decoration: underline;
}

h1,
h2 {
  overflow-wrap: anywhere;
}

h2 {
  margin-top: 0;
}

.card {
  min-width: 0;
  padding: 24px;
  margin-bottom: 20px;
  border: 1px solid #dce3ee;
  border-radius: 14px;
  background: white;
  overflow-wrap: anywhere;
}

.description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.responsible {
  font-size: 20px;
  font-weight: 600;
}

.badge {
  display: inline-block;
  padding: 5px 10px;
  border-radius: 20px;
  background: #edf1fb;
  color: #2457d6;
  font-weight: 600;
}

form {
  display: grid;
  gap: 12px;
  max-width: 600px;
  width: 100%;
  min-width: 0;
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
  min-width: 0;
  max-width: 100%;
  border: 1px solid #b7c3d4;
  background: white;
  color: #182338;
}

textarea {
  resize: vertical;
}

button {
  max-width: 100%;
  min-height: 44px;
  border: 1px solid #2457d6;
  background: #2457d6;
  color: white;
  cursor: pointer;
  white-space: normal;
}

button:hover:not(:disabled) {
  background: #1946b2;
}

button.secondary {
  background: white;
  color: #2457d6;
}

button.secondary:hover:not(:disabled) {
  background: #eef2ff;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.error,
.success {
  padding: 14px;
  border-radius: 8px;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.error {
  background: #fff0f0;
  color: #a52121;
  border: 1px solid #fecaca;
}

.success {
  background: #e7f6ed;
  color: #17663a;
  border: 1px solid #bbf7d0;
}

.priority-section form {
  max-width: 460px;
}

.field-help {
  margin: 0;
  color: #5f6b7a;
  line-height: 1.5;
  font-size: 14px;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.technician-actions p {
  line-height: 1.5;
}

.technician-actions form {
  max-width: 100%;
}

.character-count {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  text-align: right;
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
  outline: 3px solid #2457d6;
  outline-offset: 3px;
}

@media (max-width: 768px) {
  .detail-page {
    padding: 20px 16px;
  }

  .card {
    padding: 20px;
  }

  form {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 480px) {
  .detail-page {
    padding: 14px 12px;
  }

  header {
    margin: 18px 0;
  }

  h1 {
    font-size: 23px;
  }

  h2 {
    font-size: 18px;
  }

  .brand {
    display: block;
    margin-bottom: 10px;
    font-size: 13px;
  }

  .card {
    padding: 18px 16px;
    border-radius: 12px;
  }

  .card > button,
  form button,
  .form-actions button {
    width: 100%;
  }

  .form-actions {
    flex-direction: column;
  }

  input,
  select,
  textarea {
    font-size: 16px;
  }

  .responsible {
    font-size: 18px;
  }

  .technician-actions button {
    width: 100%;
  }
}
</style>
