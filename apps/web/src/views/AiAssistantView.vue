<script setup lang="ts">
import AssistantPanel from '@/components/AssistantPanel.vue'
</script>

<template>
  <section class="card" data-testid="ai-assistant-view">
    <h1>Asistente técnico</h1>
    <p class="hint">
      Recibe recomendaciones de diagnóstico basadas en el conocimiento autorizado de la organización. Las respuestas
      las genera una IA y deben ser revisadas por una persona antes de usarse. El asistente no modifica tickets.
    </p>
    <AssistantPanel />
  </section>
</template>

<style scoped>
.hint { color: #5f6b7a; font-size: 14px; }
</style>
