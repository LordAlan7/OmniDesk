<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ApiError } from '@/api/http'
import { askAssistant, type AssistantAnswer, type AssistantReference } from '../services/aiAssistant'

/**
 * Asistente de IA para soporte (AIR-001).
 *
 * - Panel simple: una caja de pregunta, un botón, una lista de turnos.
 * - Se abre desde el detalle del ticket (decisión 2 del usuario); `ticketId`
 *   se pasa como prop y el backend lo usa para incluir el contexto filtrado
 *   (decisión 4: auto-llenado desde el detalle, sin que el usuario lo escriba).
 * - La respuesta siempre se marca como generada por IA; las referencias se
 *   muestran como enlaces legibles (AIR-003 / AIR-007).
 * - No permite acciones: solo consulta. El técnico decide (AIR-004 / AIR-006).
 */
const props = defineProps<{ ticketId?: number }>()

interface Turn {
  question: string
  answer: AssistantAnswer | null
  loading: boolean
  error: string
}

const turns = ref<Turn[]>([])
const question = ref('')
const sending = ref(false)
const error = ref('')
const listRef = ref<HTMLDivElement | null>(null)

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
    if (cause instanceof ApiError) {
      turn.error = cause.message
    } else {
      turn.error = 'No se pudo obtener respuesta del asistente.'
    }
  } finally {
    sending.value = false
    await scrollToEnd()
  }
}

async function scrollToEnd() {
  await nextTick()
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
}

function sourceLabel(ref: AssistantReference): string {
  const tipo = ref.sourceType === 'article' ? 'Artículo' : 'Documento'
  return `${tipo} #${ref.sourceId} (v${ref.sourceVersion}) — ${ref.title}`
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
          <p v-if="turn.answer.status === 'insufficient_information'" class="hint">
            No se encontraron fuentes autorizadas suficientes para responder.
          </p>
          <p v-if="props.ticketId" class="hint">
            Contexto usado: ticket #{{ props.ticketId }}.
          </p>
          <details v-if="turn.answer.references.length" class="refs">
            <summary>Fuentes usadas ({{ turn.answer.references.length }})</summary>
            <ul>
              <li v-for="(r, i) in turn.answer.references" :key="i">
                {{ sourceLabel(r) }}
              </li>
            </ul>
          </details>
          <p class="ai-disclaimer">⚠ Respuesta generada por IA. Revisa antes de aplicar.</p>
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
.turns { max-height: 380px; overflow-y: auto; margin: 12px 0 16px; padding-right: 4px; }
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
form { display: grid; gap: 8px; max-width: 100%; margin-top: 12px; }
label { font-weight: 600; }
textarea { width: 100%; border: 1px solid #b7c3d4; border-radius: 8px; padding: 11px 14px; font: inherit; resize: vertical; }
.counter { font-size: 12px; color: #5f6b7a; text-align: right; }
button { border: 1px solid #2457d6; background: #2457d6; color: white; padding: 11px 14px; border-radius: 8px; font: inherit; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.error { background: #fff0f0; color: #a52121; padding: 10px; border-radius: 6px; }
.hint { color: #5f6b7a; font-size: 13px; line-height: 1.5; }
button:focus-visible, textarea:focus-visible { outline: 2px solid #2457d6; outline-offset: 3px; }
</style>