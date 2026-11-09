<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AssistantReference } from '../services/aiAssistant'
import { apiRequest } from '../services/api'
import { getDocument, downloadDocument } from '../services/documents'

const props = defineProps<{
  references: AssistantReference[]
}>()

interface GroupedReference {
  key: string
  title: string
  sourceType: 'article' | 'document'
  sourceId: number
  sourceVersion: string
  chunks: number[]
}

interface ArticleDetails {
  id: number
  title: string
  status: string
  version: number
  problemDescription: string
  solution: string
}

const busy = ref<string | null>(null)
const errors = ref<Record<string, string>>({})
const articles = ref<Record<string, ArticleDetails>>({})

const groupedReferences = computed(() => {
  const grouped = new Map<string, GroupedReference>()

  for (const reference of props.references) {
    const key = [
      reference.authorizationId,
      reference.sourceType,
      reference.sourceId,
      reference.sourceVersion,
    ].join(':')

    const existing = grouped.get(key)

    if (existing) {
      if (!existing.chunks.includes(reference.chunkIndex)) {
        existing.chunks.push(reference.chunkIndex)
      }
    } else {
      grouped.set(key, {
        key,
        title: reference.title,
        sourceType: reference.sourceType,
        sourceId: reference.sourceId,
        sourceVersion: reference.sourceVersion,
        chunks: [reference.chunkIndex],
      })
    }
  }

  return [...grouped.values()]
})

async function openReference(reference: GroupedReference) {
  if (busy.value !== null) return

  busy.value = reference.key
  errors.value[reference.key] = ''

  try {
    if (reference.sourceType === 'document') {
      const document = await getDocument(reference.sourceId)

      if (
        document.data.status !== 'published' ||
        document.data.versionId !== reference.sourceVersion
      ) {
        throw new Error(
          'La versión citada no está disponible. No se abrirá otra versión.'
        )
      }

      await downloadDocument(document.data, reference.sourceVersion)
      return
    }

    const article = await apiRequest<ArticleDetails>(
      `/knowledge/articles/${reference.sourceId}`
    )

    if (
      article.data.status !== 'approved' ||
      String(article.data.version) !== reference.sourceVersion
    ) {
      throw new Error(
        'La versión citada del artículo ya no está disponible.'
      )
    }

    articles.value[reference.key] = article.data
  } catch (error) {
    errors.value[reference.key] =
      error instanceof Error
        ? error.message
        : 'No fue posible consultar la fuente.'
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section
    v-if="groupedReferences.length"
    class="ai-references"
    aria-label="Referencias de IA"
  >
    <h4>Fuentes citadas por la IA ({{ groupedReferences.length }})</h4>

    <p class="reference-note">
      Los identificadores de las citas fueron comprobados
      contra fuentes autorizadas. La interpretación de su
      contenido requiere revisión humana.
    </p>

    <ul class="reference-list">
      <li
        v-for="reference in groupedReferences"
        :key="reference.key"
        class="reference-card"
      >
        <strong>{{ reference.title }}</strong>

        <p>
          Tipo:
          {{ reference.sourceType === 'article'
            ? 'Artículo de conocimiento'
            : 'Documento técnico' }}
        </p>

        <p>Versión citada: {{ reference.sourceVersion }}</p>

        <p>
          Fragmentos:
          {{ [...reference.chunks].sort((a, b) => a - b).join(', ') }}
        </p>

        <p class="reference-note">
          Página o sección exacta no registrada.
        </p>

        <button
          type="button"
          :disabled="busy !== null"
          @click="openReference(reference)"
        >
          {{
            busy === reference.key
              ? 'Consultando...'
              : reference.sourceType === 'document'
                ? 'Descargar documento'
                : 'Consultar artículo'
          }}
        </button>

        <p
          v-if="errors[reference.key]"
          class="reference-error"
          role="alert"
        >
          {{ errors[reference.key] }}
        </p>

        <div
          v-if="articles[reference.key]"
          class="article-details"
        >
          <p>
            <strong>Problema:</strong>
            {{ articles[reference.key]?.problemDescription }}
          </p>
          <p>
            <strong>Solución documentada:</strong>
            {{ articles[reference.key]?.solution }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ai-references {
  margin-top: 1rem;
}

.reference-list {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.reference-card {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 1rem;
  background: #f9fafb;
  color: #1f2937;
}

.reference-card p {
  margin: 0.4rem 0;
}

.reference-note {
  color: #6b7280;
  font-size: 0.85rem;
}

.reference-card button {
  padding: 0.55rem 0.8rem;
  border: 1px solid #2563eb;
  border-radius: 6px;
  background: #2563eb;
  color: white;
  cursor: pointer;
}

.reference-card button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.reference-error {
  color: #b91c1c;
}

.article-details {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-left: 3px solid #2563eb;
  background: white;
  white-space: pre-wrap;
}
</style>