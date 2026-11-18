
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/services/api'
import { hasPermission, sessionUser } from '@/services/session'
import {
  generateQuotation,
  listQuotations,
  listQuotationReviews,
  updateQuotation,
  submitQuotationForReview,
  reviewQuotation,
  type Quotation,
  type QuotationReview,
  type QuotationReviewDecision,
  type UpdateQuotationInput,
} from '@/services/quotations'

const props = defineProps<{
  ticketId: number
}>()

const quotations = ref<Quotation[]>([])
const selected = ref<Quotation | null>(null)
const reviews = ref<QuotationReview[]>([])

const loading = ref(false)
const generating = ref(false)
const saving = ref(false)
const submitting = ref(false)
const reviewing = ref(false)

const error = ref('')
const success = ref('')
const missingInformation = ref<string[]>([])

const editing = ref(false)

const form = ref({
  title: '',
  description: '',
  conditions: '',
  observations: '',
  items: [] as {
    concept: string
    description: string
    quantity: number
    unit: string
  }[],
})

const canGenerate = computed(() => hasPermission('ai:query'))
const canValidate = computed(() => hasPermission('ai:validate'))
const isManager = computed(() =>
  sessionUser.value?.roles.includes('Manager') ?? false,
)

const currentVersion = computed(() => selected.value?.currentVersion ?? null)

const canEdit = computed(() =>
  !!selected.value &&
  ['draft', 'needs_more_info'].includes(selected.value.status) &&
  selected.value.createdBy === sessionUser.value?.id,
)

const canSubmit = computed(() =>
  !!selected.value && selected.value.status === 'draft',
)

const canReview = computed(() =>
  !!selected.value &&
  selected.value.status === 'pending_review' &&
  canValidate.value,
)

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    pending_review: 'Pendiente de revisión',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    needs_more_info: 'Requiere información',
  }

  return labels[status] ?? status
}

function decisionLabel(decision: string): string {
  const labels: Record<string, string> = {
    approved: 'Aprobada',
    rejected: 'Rechazada',
    needs_more_info: 'Información adicional solicitada',
  }

  return labels[decision] ?? decision
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function loadForm(quotation: Quotation) {
  const version = quotation.currentVersion

  form.value = {
    title: version.title ?? '',
    description: version.description ?? '',
    conditions: version.conditions ?? '',
    observations: version.observations ?? '',
    items: version.items.map(item => ({
      concept: item.concept,
      description: item.description ?? '',
      quantity: Number(item.quantity),
      unit: item.unit ?? '',
    })),
  }
}

async function loadQuotations() {
  loading.value = true
  error.value = ''

  try {
    quotations.value = await listQuotations(props.ticketId)

    if (selected.value) {
      const updated = quotations.value.find(q => q.id === selected.value?.id)

      if (updated) {
        selected.value = updated
        loadForm(updated)
        await loadReviews(updated.id)
      } else {
        selected.value = null
      }
    }
  } catch (cause) {
    error.value = cause instanceof ApiError
      ? cause.message
      : 'No se pudieron cargar las cotizaciones.'
  } finally {
    loading.value = false
  }
}

async function loadReviews(id: number) {
  try {
    reviews.value = await listQuotationReviews(id)
  } catch {
    reviews.value = []
  }
}

async function selectQuotation(quotation: Quotation) {
  selected.value = quotation
  loadForm(quotation)
  editing.value = false
  missingInformation.value = []
  error.value = ''
  success.value = ''

  await loadReviews(quotation.id)
}

async function generate() {
  if (generating.value) return

  generating.value = true
  error.value = ''
  success.value = ''
  missingInformation.value = []

  try {
    const result = await generateQuotation(props.ticketId)

    missingInformation.value = result.missingInformation
    await loadQuotations()

    const created = quotations.value.find(
      quotation => quotation.id === result.quotation.id,
    )

    if (created) {
      await selectQuotation(created)
    }

    success.value = 'Se generó una propuesta de cotización.'
  } catch (cause) {
    error.value = cause instanceof ApiError
      ? cause.message
      : 'No se pudo generar la cotización.'
  } finally {
    generating.value = false
  }
}

function addItem() {
  form.value.items.push({
    concept: '',
    description: '',
    quantity: 1,
    unit: '',
  })
}

function removeItem(index: number) {
  form.value.items.splice(index, 1)
}

async function save() {
  if (!selected.value || saving.value) return

  if (!form.value.items.length) {
    error.value = 'La cotización debe contener al menos un concepto.'
    return
  }

  if (form.value.items.some(item =>
    !item.concept.trim() ||
    !Number.isFinite(item.quantity) ||
    item.quantity <= 0
  )) {
    error.value = 'Revisa los conceptos y las cantidades.'
    return
  }

  saving.value = true
  error.value = ''
  success.value = ''

  const input: UpdateQuotationInput = {
    expectedVersion: selected.value.currentVersion.versionNumber,
    title: form.value.title || null,
    description: form.value.description || null,
    conditions: form.value.conditions || null,
    observations: form.value.observations || null,
    items: form.value.items.map(item => ({
      concept: item.concept.trim(),
      description: item.description.trim() || undefined,
      quantity: Number(item.quantity),
      unit: item.unit.trim() || undefined,
    })),
  }

  try {
    selected.value = await updateQuotation(selected.value.id, input)
    editing.value = false
    loadForm(selected.value)
    success.value = 'Se guardó una nueva versión de la cotización.'
    await loadQuotations()
    await loadReviews(selected.value.id)
  } catch (cause) {
    error.value = cause instanceof ApiError
      ? cause.message
      : 'No se pudo guardar la cotización.'
  } finally {
    saving.value = false
  }
}

async function submitForReview() {
  if (!selected.value || submitting.value) return

  submitting.value = true
  error.value = ''
  success.value = ''

  try {
    selected.value = await submitQuotationForReview(selected.value.id)
    editing.value = false
    await loadQuotations()
    success.value = 'La cotización se envió a revisión.'
  } catch (cause) {
    error.value = cause instanceof ApiError
      ? cause.message
      : 'No se pudo enviar la cotización a revisión.'
  } finally {
    submitting.value = false
  }
}

async function decide(decision: QuotationReviewDecision) {
  if (!selected.value || reviewing.value) return

  if (decision === 'rejected' && !isManager.value) {
    error.value = 'Solo un Manager puede rechazar una cotización.'
    return
  }

  const labels: Record<QuotationReviewDecision, string> = {
    approved: 'Motivo de aprobación',
    rejected: 'Motivo de rechazo',
    needs_more_info: 'Información que se necesita',
  }

  const reason = window.prompt(`${labels[decision]} (mínimo 5 caracteres):`)

  if (!reason || reason.trim().length < 5) {
    error.value = 'Debes indicar un motivo de al menos 5 caracteres.'
    return
  }

  reviewing.value = true
  error.value = ''
  success.value = ''

  try {
    const result = await reviewQuotation(
      selected.value.id,
      decision,
      reason.trim(),
      selected.value.currentVersion.versionNumber,
    )

    selected.value = result.quotation
    editing.value = false
    loadForm(result.quotation)

    await loadQuotations()
    await loadReviews(result.quotation.id)

    success.value = `La cotización quedó: ${decisionLabel(decision).toLowerCase()}.`
  } catch (cause) {
    error.value = cause instanceof ApiError
      ? cause.message
      : 'No se pudo registrar la revisión.'
  } finally {
    reviewing.value = false
  }
}

function cancelEdit() {
  if (!selected.value) return
  loadForm(selected.value)
  editing.value = false
  error.value = ''
}

watch(() => props.ticketId, async () => {
  selected.value = null
  reviews.value = []
  quotations.value = []
  await loadQuotations()
})

onMounted(loadQuotations)
</script>

<template>
  <section class="card quotation-panel" aria-label="Cotizaciones">
    <header class="panel-header">
      <div>
        <h2>Cotizaciones</h2>
        <p class="hint">
          Propuestas generadas con asistencia de IA. Los precios requieren
          integración con una fuente autorizada.
        </p>
      </div>

      <button
        v-if="canGenerate"
        type="button"
        :disabled="generating || loading"
        @click="generate"
      >
        {{ generating ? 'Generando…' : 'Generar con IA' }}
      </button>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="success" class="success" role="status">{{ success }}</p>

    <div v-if="missingInformation.length" class="notice">
      <strong>Información pendiente</strong>
      <ul>
        <li v-for="(item, index) in missingInformation" :key="index">
          {{ item }}
        </li>
      </ul>
    </div>

    <p v-if="loading" class="hint">Cargando cotizaciones…</p>

    <p v-else-if="!quotations.length" class="hint">
      Todavía no hay cotizaciones para este ticket.
    </p>

    <div v-else class="quotation-layout">
      <aside class="quotation-list">
        <h3>Propuestas</h3>

        <button
          v-for="quotation in quotations"
          :key="quotation.id"
          type="button"
          class="quotation-option"
          :class="{ active: selected?.id === quotation.id }"
          @click="selectQuotation(quotation)"
        >
          <strong>Cotización #{{ quotation.id }}</strong>
          <span>{{ statusLabel(quotation.status) }}</span>
          <small>Actualizada: {{ formatDate(quotation.updatedAt) }}</small>
        </button>
      </aside>

      <div v-if="selected && currentVersion" class="quotation-detail">
        <div class="detail-header">
          <div>
            <h3>{{ form.title || `Cotización #${selected.id}` }}</h3>
            <p class="hint">
              Versión {{ currentVersion.versionNumber }} ·
              {{ statusLabel(selected.status) }}
            </p>
          </div>

          <span class="status">
            {{ statusLabel(selected.status) }}
          </span>
        </div>

        <template v-if="editing">
          <form @submit.prevent="save">
            <label>
              Título
              <input v-model="form.title" maxlength="200" />
            </label>

            <label>
              Descripción
              <textarea v-model="form.description" rows="3" />
            </label>

            <label>
              Condiciones
              <textarea v-model="form.conditions" rows="3" />
            </label>

            <label>
              Observaciones
              <textarea v-model="form.observations" rows="3" />
            </label>

            <div class="items-heading">
              <h4>Conceptos</h4>
              <button type="button" class="secondary" @click="addItem">
                Agregar concepto
              </button>
            </div>

            <div
              v-for="(item, index) in form.items"
              :key="index"
              class="item-editor"
            >
              <label>
                Concepto
                <input v-model="item.concept" maxlength="200" required />
              </label>

              <label>
                Descripción
                <textarea v-model="item.description" rows="2" />
              </label>

              <div class="item-fields">
                <label>
                  Cantidad
                  <input
                    v-model.number="item.quantity"
                    type="number"
                    min="0.000001"
                    step="any"
                    required
                  />
                </label>

                <label>
                  Unidad
                  <input v-model="item.unit" maxlength="50" />
                </label>
              </div>

              <button
                type="button"
                class="danger secondary"
                @click="removeItem(index)"
              >
                Eliminar concepto
              </button>
            </div>

            <div class="actions">
              <button type="submit" :disabled="saving">
                {{ saving ? 'Guardando…' : 'Guardar nueva versión' }}
              </button>

              <button
                type="button"
                class="secondary"
                :disabled="saving"
                @click="cancelEdit"
              >
                Cancelar
              </button>
            </div>
          </form>
        </template>

        <template v-else>
          <p v-if="currentVersion.description">
            {{ currentVersion.description }}
          </p>

          <div class="items-table">
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Cantidad</th>
                  <th>Unidad</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in currentVersion.items" :key="item.id">
                  <td>
                    <strong>{{ item.concept }}</strong>
                    <small v-if="item.description">{{ item.description }}</small>
                  </td>
                  <td>{{ item.quantity }}</td>
                  <td>{{ item.unit || '—' }}</td>
                  <td>No definido</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="currentVersion.conditions">
            <strong>Condiciones:</strong> {{ currentVersion.conditions }}
          </p>

          <p v-if="currentVersion.observations" class="observations">
            <strong>Observaciones:</strong> {{ currentVersion.observations }}
          </p>

          <div class="notice">
            <strong>INTEGRACIÓN DE SERVICIOS</strong>
            <p>
              Los precios, impuestos, descuentos y totales no están definidos.
              Esta propuesta no representa un importe comercial aprobado.
            </p>
          </div>

          <div class="actions">
            <button
              v-if="canEdit"
              type="button"
              class="secondary"
              @click="editing = true"
            >
              Editar
            </button>

            <button
              v-if="canSubmit"
              type="button"
              :disabled="submitting"
              @click="submitForReview"
            >
              {{ submitting ? 'Enviando…' : 'Enviar a revisión' }}
            </button>
          </div>
        </template>

        <div v-if="canReview" class="review-actions">
          <h4>Revisión humana</h4>
          <p class="hint">
            La aprobación requiere que la versión esté marcada como completa.
          </p>

          <div class="actions">
            <button
              type="button"
              :disabled="reviewing"
              @click="decide('approved')"
            >
              Aprobar
            </button>

            <button
              v-if="isManager"
              type="button"
              class="danger"
              :disabled="reviewing"
              @click="decide('rejected')"
            >
              Rechazar
            </button>

            <button
              type="button"
              class="secondary"
              :disabled="reviewing"
              @click="decide('needs_more_info')"
            >
              Solicitar información
            </button>
          </div>
        </div>

        <section class="review-history">
          <h4>Historial de revisiones</h4>

          <p v-if="!reviews.length" class="hint">
            No hay revisiones registradas.
          </p>

          <ol v-else>
            <li v-for="review in reviews" :key="review.id">
              <strong>{{ decisionLabel(review.decision) }}</strong>
              <p>{{ review.reason }}</p>
              <small>{{ formatDate(review.reviewedAt) }}</small>
            </li>
          </ol>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.quotation-panel { margin-top: 20px; }
.panel-header, .detail-header, .items-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.panel-header { margin-bottom: 18px; }
.panel-header h2, .detail-header h3, .quotation-list h3 { margin-top: 0; }
.quotation-layout {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 20px;
}
.quotation-list { display: flex; flex-direction: column; gap: 8px; }
.quotation-option {
  display: grid;
  gap: 5px;
  text-align: left;
  background: white;
  color: #182338;
  border: 1px solid #dce3ee;
}
.quotation-option.active { border-color: #2457d6; background: #f0f4ff; }
.quotation-option span, .quotation-option small { font-size: 12px; }
.quotation-detail { min-width: 0; }
.status {
  padding: 6px 10px;
  border-radius: 20px;
  background: #edf1fb;
  color: #2457d6;
  font-size: 12px;
  white-space: nowrap;
}
.quotation-detail form { max-width: none; }
.quotation-detail label { display: grid; gap: 6px; margin-bottom: 12px; }
.items-heading { margin: 20px 0 12px; }
.item-editor {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid #e4e9f1;
  border-radius: 8px;
}
.item-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.items-table { overflow-x: auto; margin: 16px 0; }
table { width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 10px 8px; border-bottom: 1px solid #e4e9f1; vertical-align: top; }
td small { display: block; margin-top: 4px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.review-actions, .review-history {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #e4e9f1;
}
.review-history ol { padding-left: 20px; }
.review-history li { padding: 10px 0; }
.notice {
  margin: 16px 0;
  padding: 14px;
  border: 1px solid #e4e9f1;
  border-radius: 8px;
  background: #f8f9ff;
}
.notice p { margin-bottom: 0; }
.observations { white-space: pre-wrap; }
.error, .success { padding: 12px; border-radius: 8px; }
.error { background: #fff0f0; color: #a52121; }
.success { background: #e7f6ed; color: #17663a; }
.hint { color: #5f6b7a; font-size: 13px; line-height: 1.5; }
.danger { background: #a52121; border-color: #a52121; color: white; }
button.danger.secondary { background: white; color: #a52121; }
@media (max-width: 700px) {
  .quotation-layout { grid-template-columns: 1fr; }
  .panel-header, .detail-header { align-items: flex-start; flex-direction: column; }
}
</style>
