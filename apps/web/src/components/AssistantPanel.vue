<script setup lang="ts">
import AIReferences from './AIReferences.vue'
import { computed, nextTick, ref } from 'vue'
import { ApiError } from '@/api/http'
import {
  askAssistant,
  reviewInteraction,
  applyInteraction,
  type AssistantAnswer,
  type ReviewDecision,
  type ApplyInvestigationContent,
  type ApplyResolutionContent,
} from '../services/aiAssistant'
import { hasPermission } from '../services/session'

/**
 * Asistente de IA para soporte (AIR-001) + revisión humana (AIR-004) + AIR-006.
 */
const props = defineProps<{ ticketId?: number }>()

interface Turn {
  question: string
  answer: AssistantAnswer | null
  loading: boolean
  error: string
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
    turn.error = cause instanceof ApiError ? cause.message : 'No se pudo obtener respuesta del asistente.'
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
        answer: {
          id: result.followUp.id,
          status: result.followUp.status as 'answered' | 'insufficient_information',
          answer: result.followUp.answer,
          references: [],
          aiGenerated: true,
          createdAt: new Date().toISOString(),
        },
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
  <section class="card assistant" aria-label="Asistente de IA">
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
        </div>

        <div v-else-if="turn.answer" class="bubble ai">
          <strong>Asistente (IA):</strong>
          <p class="ai-text">{{ turn.answer.answer }}</p>
          
          <!-- 1. Origen IA (NFR-003) -->
          <div class="mt-3 mb-2 flex flex-col gap-2">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 w-fit">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
              Generado por IA
            </span>

            <!-- 2. Estado de la revisión (AIR-004 / AIR-006) -->
            <div v-if="turn.reviewDecision" class="flex items-center gap-2 text-sm">
              <span v-if="turn.reviewDecision === 'approved'" class="text-green-700 font-medium flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Confirmado. Listo para aplicar.
              </span>
              <span v-else-if="turn.reviewDecision === 'rejected'" class="text-red-700 font-medium flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                Rechazado
              </span>
              <span v-else-if="turn.reviewDecision === 'needs_more_info'" class="text-yellow-700 font-medium flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Requiere más información
              </span>
            </div>
            
            <!-- 3. Estado de Aplicado (AIR-006) -->
            <div v-if="turn.applied" class="text-sm text-gray-700 bg-gray-50 p-2.5 rounded-md border border-gray-200 flex items-center gap-2 w-fit">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-500">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
              <span><strong>Aplicado</strong> al ticket #{{ turn.applied.destinationId }} el {{ formatDate(turn.applied.appliedAt) }}</span>
            </div>
          </div>

          <p v-if="turn.answer.status === 'insufficient_information'" class="hint">
            No se encontraron fuentes autorizadas suficientes para responder.
          </p>
          <p v-if="props.ticketId" class="hint">
            Contexto usado: ticket #{{ props.ticketId }}.
          </p>
          
          <AIReferences :references="turn.answer.references" />

          <!-- Acciones de revisión -->
          <div v-if="canValidate && !turn.reviewDecision && turn.answer.status === 'answered'" class="review-actions">
            <button type="button" class="secondary" :disabled="!!turn.reviewBusy" @click="submitReview(turn, 'approved')">Aprobar recomendación</button>
            <button type="button" class="secondary" :disabled="!!turn.reviewBusy" @click="submitReview(turn, 'needs_more_info')">Solicitar más información</button>
            <button v-if="isManager" type="button" class="secondary danger" :disabled="!!turn.reviewBusy" @click="submitReview(turn, 'rejected')">Rechazar</button>
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