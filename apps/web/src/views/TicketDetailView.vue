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
  getEligibleTechnicians,
  getTicket,
  getTicketHistory,
  updatePriority,
  getPriorities,
  getAttachments,
  uploadAttachment,
  getAttachmentUrl,
  type TicketAttachment,
  type Priority,
  type TechnicianCandidate,
  type Ticket,
  type TicketHistoryEntry,
} from '../services/tickets'

const route = useRoute()
const router = useRouter()

const ticket = ref<Ticket | null>(null)
const candidates = ref<TechnicianCandidate[]>([])
const history = ref<TicketHistoryEntry[]>([])
const priorities = ref<Priority[]>([])

const loading = ref(false)
const saving = ref(false)
const editing = ref(false)
const loadingCandidates = ref(false)
const editingPriority = ref(false)
const priorityLoading = ref(false)

const selectedId = ref<number | ''>('')
const reason = ref('')
const error = ref('')
const actionError = ref('')
const historyError = ref('')
const success = ref('')
const priorityError = ref('')
const prioritySuccess = ref('')
const selectedPriorityId = ref<number | ''>('')
const priorityReason = ref('')

const attachments = ref<TicketAttachment[]>([])
const loadingAttachments = ref(false)
const uploading = ref(false)
const attachmentError = ref('')
const attachmentSuccess = ref('')
const selectedFile = ref<File | null>(null)


let loadSequence = 0

const canAssign = computed(() =>
  hasPermission('tickets:assign') &&
  !!ticket.value &&
  ['Open', 'Assigned'].includes(ticket.value.status),
)

const canPrioritize = computed(() =>
  hasPermission('tickets:priority:update') &&
  !!ticket.value &&
  ticket.value.status !== 'Closed',
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

const currentPriority = computed(() => {
  if (!ticket.value?.priorityId) return null
  return priorities.value.find(p => p.id === ticket.value?.priorityId) ?? null
})

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

  if (entry.action === 'priority_changed') {
    const fromPriority = typeof entry.from === 'number'
      ? priorities.value.find(p => p.id === entry.from)?.name ?? `Prioridad #${entry.from}`
      : 'Sin prioridad'
    const toPriority = typeof entry.to === 'number'
      ? priorities.value.find(p => p.id === entry.to)?.name ?? `Prioridad #${entry.to}`
      : 'Sin prioridad'
    return `Prioridad: ${fromPriority} → ${toPriority}`
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
    priorities.value = []
    clearSession()
    await router.replace('/login')
    return true
  }

  if (cause.status === 403 || cause.status === 404) {
    ticket.value = null
    history.value = []
    candidates.value = []
    priorities.value = []
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

async function loadPriorities() {
  if (priorities.value.length > 0) return
  priorityLoading.value = true
  try {
    priorities.value = await getPriorities()
  } catch {
    // Si falla, el selector simplemente estará vacío
  } finally {
    priorityLoading.value = false
  }
}

async function loadTicket() {
  const sequence = ++loadSequence
  const id = Number(route.params.id)

  ticket.value = null
  history.value = []
  candidates.value = []
  priorities.value = []
  selectedId.value = ''
  reason.value = ''
  editing.value = false
  error.value = ''
  actionError.value = ''
  success.value = ''
  historyError.value = ''
  priorityError.value = ''
  prioritySuccess.value = ''
  editingPriority.value = false
  selectedPriorityId.value = ''
  priorityReason.value = ''
  loading.value = true

  try {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(
        'El identificador del ticket no es válido.',
      )
    }

    const result = await getTicket(id)

    if (sequence !== loadSequence) return

    ticket.value = result
    
    // Cargar prioridades si el usuario puede priorizar
    if (canPrioritize.value) {
      await loadPriorities()
    }

    await loadHistory(id, sequence)
    await loadAttachments(id)

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

function openPriorityEditor() {
  if (!ticket.value || !canPrioritize.value) return
  selectedPriorityId.value = ticket.value.priorityId ?? ''
  priorityReason.value = ''
  editingPriority.value = true
  priorityError.value = ''
  prioritySuccess.value = ''
}

function cancelPriorityEdit() {
  editingPriority.value = false
  selectedPriorityId.value = ''
  priorityReason.value = ''
  priorityError.value = ''
}

async function savePriority() {
  if (
    !ticket.value ||
    !canPrioritize.value ||
    saving.value ||
    !selectedPriorityId.value
  ) {
    return
  }

  const sequence = loadSequence
  saving.value = true
  priorityError.value = ''
  prioritySuccess.value = ''

  try {
    const saved = await updatePriority(
      ticket.value.id,
      {
        priorityId: Number(selectedPriorityId.value),
        expectedVersion: ticket.value.version,
        ...(priorityReason.value.trim()
          ? { reason: priorityReason.value.trim() }
          : {}),
      },
    )

    if (sequence !== loadSequence) return

    ticket.value = saved
    editingPriority.value = false
    selectedPriorityId.value = ''
    priorityReason.value = ''
    prioritySuccess.value = 'Prioridad actualizada correctamente.'

    await loadHistory(saved.id, sequence)
  } catch (cause) {
    if (sequence !== loadSequence) return
    if (await handleAccessError(cause)) return

    if (
      cause instanceof ApiError &&
      cause.status === 409
    ) {
      await loadTicket()

      priorityError.value =
        'No se guardó el cambio. Revisa la prioridad actual antes de volver a intentar.'

      return
    }

    priorityError.value = cause instanceof Error
      ? cause.message
      : 'No se pudo guardar la prioridad.'
  } finally {
    saving.value = false
  }
}

async function loadAttachments(id: number) {
  loadingAttachments.value = true
  attachmentError.value = ''
  try {
    attachments.value = await getAttachments(id)
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 403) {
      // Sin permiso para ver adjuntos, simplemente ocultar la sección
      attachments.value = []
    } else if (cause instanceof ApiError && cause.status !== 404) {
      attachmentError.value = cause.message
    }
  } finally {
    loadingAttachments.value = false
  }
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
}

async function handleUpload() {
  if (!ticket.value || !selectedFile.value || uploading.value) return

  uploading.value = true
  attachmentError.value = ''
  attachmentSuccess.value = ''

  try {
    await uploadAttachment(ticket.value.id, selectedFile.value)
    selectedFile.value = null
    
    // Limpiar input
    const input = document.getElementById('file-input') as HTMLInputElement
    if (input) input.value = ''
    
    attachmentSuccess.value = 'Archivo subido correctamente.'
    await loadAttachments(ticket.value.id)
    await loadHistory(ticket.value.id, loadSequence)
  } catch (cause) {
    attachmentError.value = cause instanceof Error ? cause.message : 'Error al subir archivo.'
  } finally {
    uploading.value = false
  }
}

async function handleDownload(att: TicketAttachment) {
  try {
    const url = await getAttachmentUrl(ticket.value!.id, att.id)
    const link = document.createElement('a')
    link.href = url
    link.download = att.originalName
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  } catch (cause) {
    attachmentError.value = cause instanceof Error ? cause.message : 'Error al descargar.'
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isPreviewable(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'].includes(mimeType)
}

async function handlePreview(att: TicketAttachment) {
  try {
    const url = await getAttachmentUrl(ticket.value!.id, att.id)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  } catch (cause) {
    attachmentError.value = cause instanceof Error ? cause.message : 'Error al previsualizar.'
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

        <section
          class="card"
          :aria-busy="saving || priorityLoading"
        >
          <h2>Prioridad</h2>

          <p class="responsible">
            {{
              currentPriority
                ? `${currentPriority.name} - ${currentPriority.description}`
                : 'Pendiente de priorización'
            }}
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
            v-if="canPrioritize && !editingPriority"
            :disabled="saving || priorityLoading"
            @click="openPriorityEditor"
          >
            {{
              ticket.priorityId === null
                ? 'Asignar prioridad'
                : 'Cambiar prioridad'
            }}
          </button>

          <form
            v-if="editingPriority && canPrioritize"
            @submit.prevent="savePriority"
          >
            <label for="priority">
              Nueva prioridad
            </label>

            <select
              id="priority"
              v-model="selectedPriorityId"
              required
              :disabled="saving"
            >
              <option disabled value="">
                Selecciona una prioridad
              </option>

              <option
                v-for="p in priorities"
                :key="p.id"
                :value="p.id"
              >
                {{ p.name }} - {{ p.description }}
              </option>
            </select>

            <label for="priority-reason">
              Motivo (opcional)
            </label>

            <textarea
              id="priority-reason"
              v-model="priorityReason"
              maxlength="500"
              rows="3"
              :disabled="saving"
            />

            <button
              type="submit"
              :disabled="saving || !selectedPriorityId"
            >
              {{
                saving
                  ? 'Guardando…'
                  : 'Confirmar prioridad'
              }}
            </button>
            <button
              type="button"
              class="secondary"
              :disabled="saving"
              @click="cancelPriorityEdit"
            >
              Cancelar
            </button>
          </form>
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


        <section class="card">
          <h2>Evidencias y archivos adjuntos</h2>

          <p
            v-if="attachmentSuccess"
            class="success"
            role="status"
          >
            {{ attachmentSuccess }}
          </p>

          <p
            v-if="attachmentError"
            class="error"
            role="alert"
          >
            {{ attachmentError }}
          </p>

          <p v-if="loadingAttachments" role="status">
            Cargando adjuntos…
          </p>

          <div v-if="ticket.status !== 'Closed'" class="upload-area">
            <label for="file-input" class="file-label">
              Seleccionar archivo
            </label>
            <input
              id="file-input"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain"
              @change="handleFileSelect"
              :disabled="uploading"
            />
            
            <span v-if="selectedFile" class="file-name">
              {{ selectedFile.name }}
            </span>

            <button
              v-if="selectedFile"
              type="button"
              :disabled="uploading"
              @click="handleUpload"
            >
              {{ uploading ? 'Subiendo…' : 'Subir archivo' }}
            </button>

            <small class="hint">
              Formatos: JPG, PNG, GIF, WebP, PDF, TXT. Máximo 10 MB.
            </small>
          </div>

          <p v-else class="hint">
            Los tickets cerrados no aceptan nuevos adjuntos.
          </p>

          <div v-if="attachments.length > 0" class="attachments-list">
            <div
              v-for="att in attachments"
              :key="att.id"
              class="attachment-item"
            >
              <div class="attachment-info">
                <strong>{{ att.originalName }}</strong>
                <br />
                <small>
                  {{ formatBytes(att.sizeBytes) }} · {{ att.mimeType }} ·
                  Subido por {{ att.uploadedByName }} el
                  {{ formatDate(att.createdAt) }}
                </small>
              </div>
              <div class="attachment-actions">
                <button
                  v-if="isPreviewable(att.mimeType)"
                  type="button"
                  class="secondary"
                  :disabled="uploading"
                  @click="handlePreview(att)"
                >
                  Ver
                </button>
                <button
                  type="button"
                  class="secondary"
                  :disabled="uploading"
                  @click="handleDownload(att)"
                >
                  Descargar
                </button>
              </div>
            </div>
          </div>
          <p v-else-if="!loadingAttachments" class="hint">
            No hay archivos adjuntos.
          </p>
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

select,
textarea,
button {
  padding: 11px 14px;
  border-radius: 8px;
  font: inherit;
}

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

.upload-area {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px dashed #b7c3d4;
  border-radius: 8px;
}

.file-label {
  background: #2457d6;
  color: white;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.file-label:hover {
  background: #1e4ad6;
}

#file-input {
  display: none;
}

.file-name {
  color: #182338;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.hint {
  color: #5f6b7a;
  font-size: 13px;
}

.attachments-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.attachment-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid #e4e9f1;
  border-radius: 8px;
  gap: 12px;
}

.attachment-info {
  flex: 1;
  min-width: 0;
}

.attachment-info strong {
  overflow-wrap: anywhere;
}

.attachment-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.attachment-actions button {
  padding: 6px 12px;
  font-size: 13px;
}
</style>