<script setup lang="ts">
import { computed } from 'vue'
import type {
  AITransparency,
  AssistantStatus,
} from '../services/aiAssistant'

const props = defineProps<{
  transparency?: AITransparency
  status: AssistantStatus | 'technical_error'
  referenceCount: number
}>()

const display = computed(() => {
  if (props.status === 'insufficient_information') {
    return {
      status: 'insufficient_support',
      title: 'Respaldo insuficiente',
      message:
        'No hay información autorizada suficiente para respaldar una recomendación.',
      missingInformation: [] as string[],
    }
  }

  if (props.transparency?.status === 'supported') {
    if (props.referenceCount > 0) {
      return {
        status: 'supported',
        title: props.transparency.title,
        message: props.transparency.message,
        missingInformation: [],
      }
    }

    return {
      status: 'unverified',
      title: 'Respaldo no verificado',
      message:
        'Esta respuesta no incluye referencias verificables disponibles. No debe considerarse una recomendación validada.',
      missingInformation: [],
    }
  }

  if (props.transparency) {
    return {
      status: props.transparency.status,
      title: props.transparency.title,
      message: props.transparency.message,
      missingInformation: props.transparency.missingInformation,
    }
  }

  return {
    status: 'unverified',
    title: 'Verificación no disponible',
    message:
      'No se dispone de información suficiente sobre el respaldo de esta respuesta. Solicita una nueva consulta o revisión humana.',
    missingInformation: [],
  }
})

/** Paso 12: avisos informativos (p. ej. inventario no disponible). */
const notices = computed(() => props.transparency?.notices ?? [])
</script>

<template>
  <section
    class="ai-transparency"
    :data-status="display.status"
    aria-label="Transparencia de inteligencia artificial"
  >
    <strong>{{ display.status === 'supported' ? 'Contenido generado por IA' : 'Estado del asistente de IA' }}</strong>

    <h4>{{ display.title }}</h4>
    <p>{{ display.message }}</p>

    <ul
      v-if="notices.length"
      class="ai-notices"
      data-testid="ai-transparency-notices"
    >
      <li
        v-for="notice in notices"
        :key="notice"
      >
        {{ notice }}
      </li>
    </ul>

    <ul v-if="display.missingInformation.length">
      <li
        v-for="item in display.missingInformation"
        :key="item"
      >
        {{ item }}
      </li>
    </ul>

    <p v-if="display.status === 'needs_more_info'">
      Puedes proporcionar estos datos en el cuadro de consulta
      para continuar con el diagnóstico.
    </p>

    <p v-if="display.status === 'supported'">
      Las referencias están identificadas, pero su contenido
      debe revisarse antes de aplicar la recomendación.
      No se garantiza que resuelva el problema.
    </p>
  </section>
</template>

<style scoped>
.ai-transparency {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #cbd5e1;
  border-left: 4px solid #64748b;
  border-radius: 10px;
  background: #f8fafc;
  color: #1e293b;
}

.ai-transparency[data-status='supported'] {
  border-left-color: #0f766e;
}

.ai-transparency[data-status='insufficient_support'],
.ai-transparency[data-status='technical_error'],
.ai-transparency[data-status='unverified'] {
  border-left-color: #b45309;
}

.ai-transparency strong {
  font-size: 0.85rem;
}

.ai-transparency h4 {
  margin: 0.5rem 0;
  font-size: 1rem;
}

.ai-transparency p {
  margin: 0.5rem 0;
  line-height: 1.5;
}

.ai-transparency ul {
  margin: 0.75rem 0;
  padding-left: 1.5rem;
}

.ai-notices li {
  color: #92400e;
}
</style>
