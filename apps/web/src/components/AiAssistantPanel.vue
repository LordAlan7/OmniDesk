<script setup lang="ts">
import { computed, ref } from 'vue'
import AiReferences from '@/components/AiReferences.vue'
import {
  askAssistant,
  assistantErrorMessage,
  MAX_QUESTION_LENGTH,
  type AssistantResult,
} from '@/services/aiAssistant'

const props = defineProps<{ ticketId?: number; ticketTitle?: string }>()

const question = ref('')
const loading = ref(false)
const error = ref('')
const result = ref<AssistantResult | null>(null)

const trimmed = computed(() => question.value.trim())
const canSubmit = computed(() => trimmed.value.length > 0 && trimmed.value.length <= MAX_QUESTION_LENGTH && !loading.value)

async function submit() {
  // Evita envíos repetidos mientras hay una consulta en curso.
  if (!canSubmit.value) return
  loading.value = true
  error.value = ''
  result.value = null
  try {
    result.value = await askAssistant(trimmed.value, props.ticketId)
  } catch (cause) {
    // La pregunta se conserva para poder reintentar.
    error.value = assistantErrorMessage(cause)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="assistant" :aria-busy="loading" data-testid="ai-assistant">
    <p v-if="ticketId !== undefined" class="context" data-testid="ai-ticket-context">
      Contexto utilizado: ticket #{{ ticketId }}<template v-if="ticketTitle"> — {{ ticketTitle }}</template>.
      Solo se envían el título, la descripción, el estado y la categoría.
    </p>

    <form @submit.prevent="submit">
      <label for="ai-question">Describe el problema o haz tu pregunta técnica</label>
      <textarea
        id="ai-question"
        v-model="question"
        rows="4"
        :maxlength="MAX_QUESTION_LENGTH"
        :disabled="loading"
        placeholder="Ej.: La impresora de caja no imprime y el cable de red está conectado."
      />
      <div class="actions">
        <button type="submit" :disabled="!canSubmit">{{ loading ? 'Consultando…' : 'Preguntar' }}</button>
        <span class="hint">{{ trimmed.length }}/{{ MAX_QUESTION_LENGTH }}</span>
      </div>
    </form>

    <p v-if="loading" role="status" data-testid="ai-loading">La consulta está en curso. No cierres esta página…</p>

    <p v-if="error" class="error" role="alert" data-testid="ai-error">{{ error }}</p>

    <section v-if="result" class="answer" aria-live="polite" data-testid="ai-result">
      <p class="ai-label" data-testid="ai-label">
        Generado por IA · Recomendación que requiere revisión humana. No es una solución confirmada ni se aplica al ticket.
      </p>

      <template v-if="result.condition === 'recommendation'">
        <h3>Recomendación</h3>
        <p class="text">{{ result.recommendation }}</p>
        <ol v-if="result.steps.length" data-testid="ai-steps">
          <li v-for="(step, index) in result.steps" :key="index">{{ step }}</li>
        </ol>
        <div v-if="result.additionalInformation.length">
          <h3>Información adicional útil</h3>
          <ul><li v-for="(item, index) in result.additionalInformation" :key="index">{{ item }}</li></ul>
        </div>
      </template>

      <template v-else-if="result.condition === 'needs_more_info'">
        <h3>Necesito más información</h3>
        <p class="text">{{ result.message }}</p>
        <ul v-if="result.additionalInformation.length" data-testid="ai-more-info">
          <li v-for="(item, index) in result.additionalInformation" :key="index">{{ item }}</li>
        </ul>
      </template>

      <template v-else>
        <h3>Sin respaldo suficiente</h3>
        <p class="text" data-testid="ai-insufficient">{{ result.message }}</p>
      </template>

      <AiReferences :references="result.references" />
    </section>
  </div>
</template>

<style scoped>
.assistant { display: grid; gap: 12px; }
form { display: grid; gap: 8px; }
textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 8px; }
.actions { display: flex; align-items: center; gap: 12px; }
.hint, .context { color: #5f6b7a; font-size: 13px; margin: 0; }
.context { padding: 8px 12px; background: #edf1fb; border-radius: 6px; color: #243b73; }
.error { padding: 12px; background: #fff0f0; color: #a52121; margin: 0; }
.answer { border: 1px solid #e4e9f1; border-radius: 8px; padding: 16px; }
.ai-label { margin: 0 0 12px; padding: 8px 12px; background: #fff7e0; color: #7a5600; border-radius: 6px; font-weight: 600; }
.text { white-space: pre-wrap; }
</style>
