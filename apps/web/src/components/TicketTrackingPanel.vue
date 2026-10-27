<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '../services/api'
import { hasPermission } from '../services/session'
import {
  addProgressUpdate,
  getAvailableTransitions,
  listApprovedKnowledgeArticles,
  runTransition,
  setTicketDeadline,
  type AvailableTransition,
  type KnowledgeArticleOption,
  type ResolutionInput,
  type Ticket,
} from '../services/tickets'

const props = defineProps<{ ticket: Ticket }>()
const emit = defineEmits<{ changed: [] }>()

const transitions = ref<AvailableTransition[]>([])
const selected = ref('')
const transitionError = ref('')
const transitionBusy = ref(false)

// FR-009: campos ampliados de resolución
const resolutionInput = ref<ResolutionInput>({
  resolution: '',
  resolutionVerification: '',
  rootCause: '',
  observations: '',
})
const knowledgeArticleId = ref<number | ''>('')
const knowledgeArticles = ref<KnowledgeArticleOption[]>([])

// FR-009: reapertura
const reopenReason = ref('')
const reopenError = ref('')
const reopenBusy = ref(false)

const deadlineInput = ref('')
const deadlineReason = ref('')
const deadlineError = ref('')
const deadlineBusy = ref(false)

const note = ref('')
const noteError = ref('')
const noteBusy = ref(false)

const labels: Record<string, string> = {
  Open: 'Abierto',
  Assigned: 'Asignado',
  'In Progress': 'En progreso',
  Resolved: 'Resuelto',
  Closed: 'Cerrado',
}

const canEditDeadline = computed(
  () => hasPermission('tickets:deadline:update') && props.ticket.status !== 'Closed',
)
const canAddProgress = computed(
  () => hasPermission('tickets:progress:create') && props.ticket.status !== 'Closed',
)

// FR-009: el formulario de resolución se muestra cuando la transición elegida
// tiene `requiresResolution: true` (transición a Resolved).
const chosen = computed(() => transitions.value.find((item) => item.to === selected.value))

// FR-009: el botón de reapertura se muestra cuando el ticket está Resuelto y el
// usuario tiene permiso de cambio de estado. La transición Resolved → In Progress
// se filtra del dropdown de transiciones comunes y se maneja con un formulario
// dedicado (motivo obligatorio).
const canReopen = computed(
  () =>
    props.ticket.status === 'Resolved' &&
    hasPermission('tickets:status:update'),
)

// Las transiciones del dropdown excluyen la reapertura (que tiene su propio formulario).
const dropdownTransitions = computed(() =>
  transitions.value.filter((t) => !(props.ticket.status === 'Resolved' && t.to === 'In Progress')),
)

function messageOf(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError && cause.status === 409) {
    return 'El ticket cambió mientras lo editabas. Actualiza la información e inténtalo de nuevo.'
  }
  return cause instanceof Error ? cause.message : fallback
}

async function loadTransitions() {
  try {
    transitions.value = await getAvailableTransitions(props.ticket.id)
  } catch {
    transitions.value = []
  }
  selected.value = ''
}

async function loadKnowledgeArticles() {
  if (!hasPermission('knowledge:read')) {
    knowledgeArticles.value = []
    return
  }
  try {
    knowledgeArticles.value = await listApprovedKnowledgeArticles()
  } catch {
    knowledgeArticles.value = []
  }
}

function resolutionValid(): boolean {
  const r = resolutionInput.value
  if (!r.resolution.trim()) {
    transitionError.value = 'Escribe la solución aplicada.'
    return false
  }
  if (!r.resolutionVerification.trim()) {
    transitionError.value = 'Escribe la comprobación del resultado.'
    return false
  }
  return true
}

async function submitTransition() {
  const transition = chosen.value
  if (!transition || transitionBusy.value) return

  if (transition.requiresResolution && !resolutionValid()) return

  transitionBusy.value = true
  transitionError.value = ''
  try {
    const input: {
      expectedVersion: number
      resolution?: ResolutionInput
    } = { expectedVersion: props.ticket.version }

    if (transition.requiresResolution) {
      input.resolution = {
        resolution: resolutionInput.value.resolution.trim(),
        resolutionVerification: resolutionInput.value.resolutionVerification.trim(),
        ...(resolutionInput.value.rootCause?.trim()
          ? { rootCause: resolutionInput.value.rootCause.trim() }
          : {}),
        ...(resolutionInput.value.observations?.trim()
          ? { observations: resolutionInput.value.observations.trim() }
          : {}),
        ...(knowledgeArticleId.value !== ''
          ? { knowledgeArticleId: Number(knowledgeArticleId.value) }
          : {}),
      }
    }

    await runTransition(props.ticket.id, transition, input, props.ticket.status)
    emit('changed')
  } catch (cause) {
    transitionError.value = messageOf(cause, 'No se pudo cambiar el estado.')
  } finally {
    transitionBusy.value = false
  }
}

async function submitReopen() {
  if (reopenBusy.value) return
  if (!reopenReason.value.trim()) {
    reopenError.value = 'El motivo de reapertura es obligatorio.'
    return
  }

  reopenBusy.value = true
  reopenError.value = ''
  try {
    await runTransition(
      props.ticket.id,
      { to: 'In Progress', via: 'status' },
      {
        expectedVersion: props.ticket.version,
        reason: reopenReason.value.trim(),
      },
      props.ticket.status,
    )
    reopenReason.value = ''
    emit('changed')
  } catch (cause) {
    reopenError.value = messageOf(cause, 'No se pudo reabrir el ticket.')
  } finally {
    reopenBusy.value = false
  }
}

async function submitDeadline(clear = false) {
  if (deadlineBusy.value) return
  if (!clear && !deadlineInput.value) {
    deadlineError.value = 'Selecciona la fecha y hora del plazo.'
    return
  }
  if (!deadlineReason.value.trim()) {
    deadlineError.value = 'El motivo es obligatorio.'
    return
  }

  deadlineBusy.value = true
  deadlineError.value = ''
  try {
    await setTicketDeadline(props.ticket.id, {
      dueDate: clear ? null : new Date(deadlineInput.value).toISOString(),
      expectedVersion: props.ticket.version,
      reason: deadlineReason.value.trim(),
    })
    emit('changed')
  } catch (cause) {
    deadlineError.value = messageOf(cause, 'No se pudo guardar el plazo.')
  } finally {
    deadlineBusy.value = false
  }
}

async function submitNote() {
  if (noteBusy.value) return
  if (!note.value.trim()) {
    noteError.value = 'Escribe la nota de avance.'
    return
  }

  noteBusy.value = true
  noteError.value = ''
  try {
    await addProgressUpdate(props.ticket.id, note.value.trim())
    emit('changed')
  } catch (cause) {
    noteError.value = messageOf(cause, 'No se pudo registrar el avance.')
  } finally {
    noteBusy.value = false
  }
}

onMounted(async () => {
  await loadTransitions()
  await loadKnowledgeArticles()
})

watch(
  () => [props.ticket.id, props.ticket.version, props.ticket.status],
  async () => {
    await loadTransitions()
    // Reset formularios al cambiar el ticket
    resolutionInput.value = {
      resolution: '',
      resolutionVerification: '',
      rootCause: '',
      observations: '',
    }
    knowledgeArticleId.value = ''
    reopenReason.value = ''
  },
)
</script>

<template>
  <section class="card tracking" data-testid="tracking-panel">
    <h2>Seguimiento</h2>

    <p>
      Estado actual: <strong>{{ labels[ticket.status] ?? ticket.status }}</strong>
      <span v-if="ticket.isOverdue" class="overdue" data-testid="tracking-overdue">Vencido</span>
    </p>
    <p>
      Plazo vigente:
      {{ ticket.dueDate ? new Date(ticket.dueDate).toLocaleString('es-MX') : 'Sin plazo definido' }}
    </p>

    <!-- Transiciones comunes (asignación, resolución, cierre, etc.). La reapertura
         tiene su propio formulario abajo porque requiere motivo obligatorio. -->
    <form v-if="dropdownTransitions.length" @submit.prevent="submitTransition">
      <label for="tracking-transition">Cambiar estado</label>
      <select id="tracking-transition" v-model="selected" :disabled="transitionBusy">
        <option value="">Selecciona una transición</option>
        <option v-for="item in dropdownTransitions" :key="item.to" :value="item.to">
          {{ labels[item.to] ?? item.to }}
        </option>
      </select>

      <!-- FR-009: resolución ampliada con comprobación + campos opcionales + referencia a conocimiento -->
      <template v-if="chosen?.requiresResolution">
        <label for="resolution">Solución aplicada *</label>
        <textarea
          id="resolution"
          v-model="resolutionInput.resolution"
          rows="3"
          maxlength="5000"
          :disabled="transitionBusy"
          placeholder="Describe la solución aplicada."
        />

        <label for="resolution-verification">Comprobación del resultado *</label>
        <textarea
          id="resolution-verification"
          v-model="resolutionInput.resolutionVerification"
          rows="3"
          maxlength="5000"
          :disabled="transitionBusy"
          placeholder="Explica cómo comprobaste que la solución funciona."
        />

        <label for="root-cause">Causa identificada (opcional)</label>
        <textarea
          id="root-cause"
          v-model="resolutionInput.rootCause"
          rows="2"
          maxlength="2000"
          :disabled="transitionBusy"
          placeholder="Si identificaste la causa raíz, descríbela. Si no, déjalo en blanco."
        />

        <label for="observations">Observaciones (opcional)</label>
        <textarea
          id="observations"
          v-model="resolutionInput.observations"
          rows="2"
          maxlength="2000"
          :disabled="transitionBusy"
        />

        <label v-if="knowledgeArticles.length" for="knowledge-article">Artículo de conocimiento utilizado (opcional)</label>
        <select
          v-if="knowledgeArticles.length"
          id="knowledge-article"
          v-model="knowledgeArticleId"
          :disabled="transitionBusy"
        >
          <option value="">Sin artículo</option>
          <option v-for="article in knowledgeArticles" :key="article.id" :value="article.id">
            {{ article.title }}
          </option>
        </select>
        <small v-if="knowledgeArticles.length" class="hint">
          Solo se pueden referenciar artículos aprobados en la base de conocimiento (FR-011).
        </small>
      </template>

      <p v-if="transitionError" class="error" role="alert">{{ transitionError }}</p>
      <button :disabled="!selected || transitionBusy">
        {{ transitionBusy ? 'Guardando…' : 'Aplicar cambio' }}
      </button>
    </form>

    <!-- FR-009: reapertura con motivo obligatorio. Visible cuando el ticket está
         resuelto y el usuario tiene permiso de cambio de estado. -->
    <form v-if="canReopen" @submit.prevent="submitReopen" class="reopen-form">
      <label for="reopen-reason">Reabrir ticket (motivo obligatorio)</label>
      <textarea
        id="reopen-reason"
        v-model="reopenReason"
        rows="3"
        maxlength="500"
        :disabled="reopenBusy"
        placeholder="Explica por qué se reabre el ticket. La resolución previa se conservará."
      />
      <p v-if="reopenError" class="error" role="alert">{{ reopenError }}</p>
      <button :disabled="reopenBusy">
        {{ reopenBusy ? 'Reabriendo…' : 'Reabrir ticket' }}
      </button>
    </form>

    <form v-if="canEditDeadline" @submit.prevent="submitDeadline(false)">
      <label for="tracking-deadline">Nuevo plazo</label>
      <input id="tracking-deadline" v-model="deadlineInput" type="datetime-local" :disabled="deadlineBusy" />

      <label for="tracking-deadline-reason">Motivo</label>
      <input id="tracking-deadline-reason" v-model="deadlineReason" maxlength="500" :disabled="deadlineBusy" />

      <p v-if="deadlineError" class="error" role="alert">{{ deadlineError }}</p>
      <div class="actions">
        <button :disabled="deadlineBusy">
          {{ deadlineBusy ? 'Guardando…' : 'Guardar plazo' }}
        </button>
        <button
          v-if="ticket.dueDate"
          type="button"
          class="secondary"
          :disabled="deadlineBusy"
          @click="submitDeadline(true)"
        >
          Quitar plazo
        </button>
      </div>
    </form>

    <form v-if="canAddProgress" @submit.prevent="submitNote">
      <label for="tracking-note">Nota de avance</label>
      <textarea id="tracking-note" v-model="note" rows="3" maxlength="1000" :disabled="noteBusy" />

      <p v-if="noteError" class="error" role="alert">{{ noteError }}</p>
      <button :disabled="noteBusy">{{ noteBusy ? 'Guardando…' : 'Registrar avance' }}</button>
    </form>
  </section>
</template>

<style scoped>
.tracking form {
  display: grid;
  gap: 8px;
  max-width: 600px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e4e9f1;
}
.actions { display: flex; gap: 8px; }
.secondary { background: white; color: #2457d6; }
.overdue {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fff0f0;
  color: #a52121;
  font-size: 12px;
  font-weight: 700;
}
.error { padding: 8px 12px; background: #fff0f0; color: #a52121; }
.hint { color: #5f6b7a; font-size: 13px; line-height: 1.5; }
.reopen-form { background: #fff8e6; padding: 16px; border-radius: 8px; border: 1px solid #fde68a; }
</style>