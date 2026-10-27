<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '../services/api'
import { hasPermission } from '../services/session'
import {
  addProgressUpdate,
  getAvailableTransitions,
  runTransition,
  setTicketDeadline,
  type AvailableTransition,
  type Ticket,
} from '../services/tickets'

const props = defineProps<{ ticket: Ticket }>()
const emit = defineEmits<{ changed: [] }>()

const transitions = ref<AvailableTransition[]>([])
const selected = ref('')
const resolution = ref('')
const transitionError = ref('')
const transitionBusy = ref(false)

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
const chosen = computed(() => transitions.value.find((item) => item.to === selected.value))

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

async function submitTransition() {
  const transition = chosen.value
  if (!transition || transitionBusy.value) return

  if (transition.requiresResolution && !resolution.value.trim()) {
    transitionError.value = 'Escribe la resolución del ticket.'
    return
  }

  transitionBusy.value = true
  transitionError.value = ''
  try {
    await runTransition(props.ticket.id, transition, {
      expectedVersion: props.ticket.version,
      resolution: resolution.value.trim(),
    })
    emit('changed')
  } catch (cause) {
    transitionError.value = messageOf(cause, 'No se pudo cambiar el estado.')
  } finally {
    transitionBusy.value = false
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

onMounted(loadTransitions)
watch(() => [props.ticket.id, props.ticket.version, props.ticket.status], loadTransitions)
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

    <form v-if="transitions.length" @submit.prevent="submitTransition">
      <label for="tracking-transition">Cambiar estado</label>
      <select id="tracking-transition" v-model="selected" :disabled="transitionBusy">
        <option value="">Selecciona una transición</option>
        <option v-for="item in transitions" :key="item.to" :value="item.to">
          {{ labels[item.to] ?? item.to }}
        </option>
      </select>

      <template v-if="chosen?.requiresResolution">
        <label for="tracking-resolution">Resolución</label>
        <textarea id="tracking-resolution" v-model="resolution" rows="3" maxlength="2000" />
      </template>

      <p v-if="transitionError" class="error" role="alert">{{ transitionError }}</p>
      <button :disabled="!selected || transitionBusy">
        {{ transitionBusy ? 'Guardando…' : 'Aplicar cambio' }}
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
</style>
