<script setup lang="ts">
import type { AssistantReference } from '@/services/aiAssistant'

defineProps<{ references: AssistantReference[] }>()

const typeLabel = { article: 'Artículo', document: 'Documento' } as const
</script>

<template>
  <section v-if="references.length" class="references" aria-labelledby="ai-references-title" data-testid="ai-references">
    <h3 id="ai-references-title">Fuentes utilizadas</h3>
    <ul>
      <li v-for="reference in references" :key="`${reference.authorizationId}-${reference.chunkIndex}`">
        <strong>{{ reference.title }}</strong>
        <span class="meta">
          {{ typeLabel[reference.sourceType] }} #{{ reference.sourceId }} · versión {{ reference.sourceVersion }} ·
          fragmento {{ reference.chunkIndex + 1 }}
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.references { margin-top: 16px; }
ul { margin: 8px 0 0; padding-left: 20px; }
li { margin-bottom: 6px; }
.meta { display: block; color: #5f6b7a; font-size: 13px; }
</style>
