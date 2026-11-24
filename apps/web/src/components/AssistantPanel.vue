<script setup lang="ts">
import AIReferences from './AIReferences.vue'
import AITransparency from './AITransparency.vue'
import { computed, nextTick, ref } from 'vue'
import { ApiError } from '@/api/http'
import {
  askAssistant,
  reviewInteraction,
  applyInteraction,
  type AssistantAnswer,
  type AITransparency as AITransparencyInfo,
  type ReviewDecision,
  type ApplyInvestigationContent,
  type ApplyResolutionContent,
} from '../services/aiAssistant'
import { hasPermission } from '../services/session'
import { INVENTORY_READ } from '../services/inventory'

/**
 * Asistente de IA para soporte (AIR-001) + revisión humana (AIR-004) + AIR-006.
 */
const props = defineProps<{ ticketId?: number }>()

const technicalErrorTransparency: AITransparencyInfo = {
  status: 'technical_error',
  title: 'Error técnico del asistente',
  message: 'No se pudo completar la consulta. No se obtuvo una recomendación ni un diagnóstico verificado.',
  requiresHumanReview: false,
  missingInformation: [],
}
interface Turn {
  question: string
  answer: AssistantAnswer | null
  loading: boolean
  error: string
  technicalError?: boolean
  /** AIR-004: decisión de revisión vigente sobre esta interacción. */
  reviewDecision?: ReviewDecision
  reviewError?: string
  reviewBusy?: boolean
  applyMode?: 'investigation' | 'resolution' | null
  applyError?: string
  applyBusy?: boolean
  applyActivity?: string
  applyResult?: string
  applyResolution?: string
  applyVerification?: string
  applied?: { destinationId: number, appliedAt: string } | null
}

const turns = ref<Turn[]>([])
const question = ref('')
const sending = ref(false)
const error = ref('')
const listRef = ref<HTMLDivElement | null>(null)

const canValidate = computed(() => hasPermission('ai:validate'))
// Paso 12: sin inventory:read no se muestra la fuente "Inventario" aunque el backend la enviara.
const canSeeInventory = computed(() => hasPermission(INVENTORY_READ))
const rootRef = ref<HTMLElement | null>(null)
const isManager = computed(() => hasPermission('ai:sources:review'))

async function submit() {
  const q = question.value.trim()
  if (!q || sending.value) return
  if (q.length < 5) {
    error.value = 'La pregunta debe tener al menos 5 caracteres.'
    return
  }
  if (q.length > 2000) {
    error.value = 'La pregunta no puede exceder 2000 caracteres.'
    return
  }

  error.value = ''
  sending.value = true
  const turn: Turn = { question: q, answer: null, loading: true, error: '' }
  turns.value.push(turn)
  question.value = ''
  await scrollToEnd()

  try {
    const answer = await askAssistant(q, props.ticketId)
    turn.answer = answer
    turn.loading = false
  } catch (cause) {
    turn.loading = false
    turn.technicalError =
      !(cause instanceof ApiError) ||
      cause.kind === 'network' ||
      cause.kind === 'server'
    turn.error = cause instanceof ApiError
      ? cause.message
      : 'No se pudo obtener respuesta del asistente.'
  } finally {
    sending.value = false
    await scrollToEnd()
  }
}

async function submitReview(turn: Turn, decision: ReviewDecision) {
  const promptLabel =
    decision === 'approved' ? 'Motivo de aprobación (mínimo 5 caracteres)' :
    decision === 'rejected' ? 'Motivo de rechazo (mínimo 5 caracteres)' :
    'Aclaración para la nueva consulta (mínimo 5 caracteres)'
  const reason = window.prompt(promptLabel)
  if (!reason || reason.trim().length < 5) {
    turn.reviewError = 'El motivo es obligatorio (mínimo 5 caracteres).'
    return
  }
  if (reason.length > 2000) {
    turn.reviewError = 'El motivo no puede exceder 2000 caracteres.'
    return
  }

  turn.reviewError = undefined
  turn.reviewBusy = true
  await scrollToEnd()

  try {
    const result = await reviewInteraction(turn.answer!.id, decision, reason.trim())
    turn.reviewDecision = decision

    if (decision === 'needs_more_info' && result.followUp) {
      const followUpTurn: Turn = {
        question: `(Aclaración sobre la recomendación #${turn.answer!.id})`,
        answer: result.followUp,
        loading: false,
        error: '',
      }
      turns.value.push(followUpTurn)
      await scrollToEnd()
    }
  } catch (cause) {
    turn.reviewError = cause instanceof ApiError ? cause.message : 'No se pudo registrar la decisión.'
  } finally {
    turn.reviewBusy = false
    await scrollToEnd()
  }
}

function openApplyMode(turn: Turn, mode: 'investigation' | 'resolution') {
  const answer = turn.answer!.answer
  const refs = turn.answer!.references
    .map((r) => `${r.sourceType === 'article' ? 'Artículo' : 'Documento'} #${r.sourceId} v${r.sourceVersion} — ${r.title}`)
    .join('; ')

  turn.applyMode = mode
  turn.applyError = undefined
  if (mode === 'investigation') {
    turn.applyActivity = `Consulta: ${turn.question}`
    turn.applyResult = `${answer}${refs ? `\n\nFuentes: ${refs}` : ''}`
  } else {
    turn.applyResolution = answer
    turn.applyVerification = ''
  }
  scrollToEnd()
}

function cancelApply(turn: Turn) {
  turn.applyMode = null
  turn.applyError = undefined
}

async function confirmApply(turn: Turn) {
  if (!props.ticketId) {
    turn.applyError = 'No hay ticket asociado a esta recomendación.'
    return
  }
  turn.applyError = undefined
  turn.applyBusy = true
  await scrollToEnd()

  try {
    if (turn.applyMode === 'investigation') {
      const content: ApplyInvestigationContent = {
        activity: turn.applyActivity ?? '',
        result: turn.applyResult ?? '',
      }
      const res = await applyInteraction(turn.answer!.id, 'investigation', props.ticketId, content)
      turn.applied = { destinationId: props.ticketId, appliedAt: new Date().toISOString() }
      turn.applyMode = null
    } else if (turn.applyMode === 'resolution') {
      const content: ApplyResolutionContent = {
        resolution: turn.applyResolution ?? '',
        resolutionVerification: turn.applyVerification ?? '',
      }
      const versionStr = window.prompt(
        'Versión actual del ticket (necesaria para resolver). Revísala en la sección "Atención del ticket".',
      )
      const expectedVersion = Number(versionStr)
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        turn.applyError = 'Versión inválida. La resolución no se guardó.'
        turn.applyBusy = false
        return
      }
      const res = await applyInteraction(turn.answer!.id, 'resolution', props.ticketId, content, expectedVersion)
      turn.applied = { destinationId: props.ticketId, appliedAt: new Date().toISOString() }
      turn.applyMode = null
    }
  } catch (cause) {
    turn.applyError = cause instanceof ApiError ? cause.message : 'No se pudo aplicar la recomendación.'
  } finally {
    turn.applyBusy = false
    await scrollToEnd()
  }
}

const VEHICLE_QUESTION =
  'Con los datos de la motocicleta de este ticket (modelo, año, garantía y refacciones compatibles), ¿qué debo revisar para atender la falla?'

/**
 * Paso 12: acción rápida "Preguntar a la IA sobre esta moto".
 * Reutiliza el flujo normal de `submit` (mismo ticketId, mismos permisos y
 * validaciones del backend). No hace nada si no hay ticket o ya hay una consulta en curso.
 */
async function askAboutVehicle() {
  if (!props.ticketId || sending.value) return
  question.value = VEHICLE_QUESTION
  await nextTick()
  rootRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  await submit()
}

defineExpose({ askAboutVehicle })

async function scrollToEnd() {
  await nextTick()
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
}

function formatDate(dateString: string) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}
</script>

<template>
  <section ref="rootRef" class="card assistant" aria-label="Asistente de IA">
    <h2>Asistente de soporte</h2>
    <p class="hint">
      Pregunta al asistente sobre manuales, artículos aprobados y soluciones
      documentadas. La respuesta es una <strong>recomendación</strong>: tú decides
      si aplicarla. Si el asistente no tiene fuentes suficientes, lo indicará.
    </p>

    <div v-if="turns.length" ref="listRef" class="turns">
      <article v-for="(turn, idx) in turns" :key="idx" class="turn">
        <div class="bubble user">
          <strong>Tú:</strong>
          <p>{{ turn.question }}</p>
        </div>

        <div v-if="turn.loading" class="bubble ai loading" role="status">
          <strong>Asistente (IA):</strong>
          <p>Generando respuesta…</p>
        </div>

        <div v-else-if="turn.error" class="bubble ai error" role="alert">
          <strong>Asistente (IA):</strong>
          <p>{{ turn.error }}</p>
          <AITransparency
            v-if="turn.technicalError"
            :transparency="technicalErrorTransparency"
            status="technical_error"
            :reference-count="0"
          />
        </div>

        <div v-else-if="turn.answer" class="bubble ai">
          <strong>Asistente (IA):</strong>
          <p class="ai-text">{{ turn.answer.answer }}</p>
          <AITransparency
            :transparency="turn.answer.transparency"
            :status="turn.answer.status"
            :reference-count="turn.answer.references.length"
          />
          <p v-if="turn.answer.status === 'insufficient_information'" class="hint">
            No se encontraron fuentes autorizadas suficientes para responder.
          </p>
          <p v-if="props.ticketId" class="hint">
            Contexto usado: ticket #{{ props.ticketId }}.
          </p>
          
          <AIReferences
            :references="turn.answer.references"
            :inventory="canSeeInventory ? turn.answer.inventory : null"
          />
          <p v-if="turn.answer.status === 'answered' && turn.answer.transparency?.status === 'supported' && turn.answer.references.length > 0" class="ai-disclaimer">⚠ Respuesta generada por IA. Revisa antes de aplicar.</p>

          <!-- AIR-004: acciones de revisión. Sólo para usuarios con ai:validate.
               Abrir la recomendación NO la aprueba; se exige acción explícita + motivo. -->
          <div v-if="canValidate && !turn.reviewDecision && turn.answer.status === 'answered' && turn.answer.transparency?.status === 'supported' && turn.answer.references.length > 0" class="review-actions">
            <button
              type="button"
              class="secondary"
              :disabled="!!turn.reviewBusy"
              @click="submitReview(turn, 'approved')"
            >Aprobar recomendación</button>
            <button
              type="button"
              class="secondary"
              :disabled="!!turn.reviewBusy"
              @click="submitReview(turn, 'needs_more_info')"
            >Solicitar más información</button>
            <button
              v-if="isManager"
              type="button"
              class="secondary danger"
              :disabled="!!turn.reviewBusy"
              @click="submitReview(turn, 'rejected')"
            >Rechazar</button>
          </div>

          <p v-if="turn.reviewError" class="error" role="alert">{{ turn.reviewError }}</p>

          <!-- Aplicar -->
          <div v-if="turn.reviewDecision === 'approved' && !turn.applyMode && !turn.applied" class="apply-actions">
            <button v-if="props.ticketId" type="button" class="secondary" @click="openApplyMode(turn, 'investigation')">Aplicar a investigación</button>
            <button v-if="props.ticketId" type="button" class="secondary" @click="openApplyMode(turn, 'resolution')">Aplicar a resolución</button>
          </div>

          <div v-if="turn.applyMode === 'investigation'" class="apply-form">
            <h3>Aplicar a investigación</h3>
            <p class="hint">El contenido está pre-lleno con la recomendación. Edítalo antes de confirmar.</p>
            <label for="apply-activity">Actividad *</label>
            <textarea id="apply-activity" v-model="turn.applyActivity" rows="3" maxlength="5000" :disabled="!!turn.applyBusy" />
            <label for="apply-result">Resultado *</label>
            <textarea id="apply-result" v-model="turn.applyResult" rows="4" maxlength="5000" :disabled="!!turn.applyBusy" />
            <div class="apply-buttons">
              <button type="button" :disabled="!!turn.applyBusy" @click="confirmApply(turn)">Confirmar aplicación</button>
              <button type="button" class="secondary" :disabled="!!turn.applyBusy" @click="cancelApply(turn)">Cancelar</button>
            </div>
          </div>

          <div v-if="turn.applyMode === 'resolution'" class="apply-form">
            <h3>Aplicar a resolución</h3>
            <p class="hint">
              Pre-llena el formulario de resolución. La comprobación del resultado
              es obligatoria (FR-009). El ticket pasa a "Resolved"; el cierre sigue siendo manual.
            </p>
            <label for="apply-resolution">Solución aplicada *</label>
            <textarea id="apply-resolution" v-model="turn.applyResolution" rows="4" maxlength="5000" :disabled="!!turn.applyBusy" />
            <label for="apply-verification">Comprobación del resultado *</label>
            <textarea id="apply-verification" v-model="turn.applyVerification" rows="3" maxlength="5000" :disabled="!!turn.applyBusy" placeholder="¿Cómo verificaste que quedó solucionado?" />
            <div class="apply-buttons">
              <button type="button" :disabled="!!turn.applyBusy" @click="confirmApply(turn)">Confirmar aplicación</button>
              <button type="button" class="secondary" :disabled="!!turn.applyBusy" @click="cancelApply(turn)">Cancelar</button>
            </div>
          </div>

          <p v-if="turn.applyError" class="error" role="alert">{{ turn.applyError }}</p>
        </div>
      </article>
    </div>

    <form @submit.prevent="submit" novalidate>
      <label for="assistant-question">Tu pregunta</label>
      <textarea
        id="assistant-question"
        v-model="question"
        rows="2"
        maxlength="2000"
        :disabled="sending"
        placeholder="Ej. ¿Cómo se reinicia la impresora de caja?"
      />
      <p class="counter">{{ question.length }} / 2000</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="sending || question.trim().length < 5">
        {{ sending ? 'Enviando…' : 'Preguntar' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.assistant { background: #f7f8ff; border-color: #c7d4f5; }
.turns { max-height: 480px; overflow-y: auto; margin: 12px 0 16px; padding-right: 4px; }
.turn { margin-bottom: 14px; }
.bubble { padding: 12px 14px; border-radius: 10px; margin-bottom: 8px; overflow-wrap: anywhere; }
.bubble.user { background: #eef2ff; border: 1px solid #d6def0; }
.bubble.ai { background: white; border: 1px solid #dce3ee; }
.bubble.ai.error { background: #fff0f0; border-color: #f5c7c7; }
.bubble strong { display: block; font-size: 12px; color: #5f6b7a; margin-bottom: 4px; }
.bubble p { margin: 0; line-height: 1.5; white-space: pre-wrap; }
.ai-text { font-family: inherit; }
.ai-disclaimer { margin-top: 8px; font-size: 12px; color: #92400e; background: #fffbeb; padding: 6px 8px; border-radius: 6px; }
.refs { margin-top: 8px; }
.refs summary { cursor: pointer; font-size: 13px; color: #2457d6; }
.refs ul { padding-left: 20px; margin: 6px 0 0; font-size: 13px; color: #464555; }

.review-actions { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
.review-actions button { padding: 8px 14px; font-size: 14px; }
.review-actions button.danger { border-color: #a52121; background: #a52121; color: white; }

.apply-actions { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
.apply-actions button { padding: 8px 14px; font-size: 14px; }

.apply-form { margin-top: 12px; padding: 12px; border: 1px solid #d6def0; border-radius: 8px; background: #fbfcff; }
.apply-form h3 { margin: 0 0 4px; font-size: 15px; color: #182338; }
.apply-form label { display: block; margin-top: 10px; font-size: 13px; font-weight: 600; }
.apply-form textarea { width: 100%; border: 1px solid #b7c3d4; border-radius: 8px; padding: 8px 10px; font: inherit; resize: vertical; margin-top: 4px; }
.apply-buttons { margin-top: 12px; display: flex; gap: 8px; }
.apply-buttons button { padding: 8px 14px; font-size: 14px; }

form { display: grid; gap: 8px; max-width: 100%; margin-top: 12px; }
label { font-weight: 600; }
textarea { width: 100%; border: 1px solid #b7c3d4; border-radius: 8px; padding: 11px 14px; font: inherit; resize: vertical; }
.counter { font-size: 12px; color: #5f6b7a; text-align: right; }
button { border: 1px solid #2457d6; background: #2457d6; color: white; padding: 11px 14px; border-radius: 8px; font: inherit; cursor: pointer; }
button.secondary { background: white; color: #2457d6; }
button:disabled { opacity: 0.5; cursor: default; }
.error { background: #fff0f0; color: #a52121; padding: 10px; border-radius: 6px; }
.hint { color: #5f6b7a; font-size: 13px; line-height: 1.5; }
button:focus-visible, textarea:focus-visible { outline: 2px solid #2457d6; outline-offset: 3px; }
</style>