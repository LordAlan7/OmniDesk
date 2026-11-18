<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ApiError } from '../services/api'
import { suggestTicketFields, type TicketSuggestion } from '../services/aiAssistant'
import {
  createTicket,
  getCategories,
  type Category,
} from '../services/tickets'

// Estados de la interfaz
const saving = ref(false)
const error = ref('')
const successId = ref<number | null>(null)

// Categorías
const categories = ref<Category[]>([])
const loadingCategories = ref(true)

// Estados de la IA
const generatingAI = ref(false)
const aiSuggestion = ref<TicketSuggestion | null>(null)
const aiError = ref('')

// Formulario
const form = reactive({
  title: '',
  description: '',
  categoryId: 0,
  storeLocation: '',
  motorcycleModel: '',
})

// Errores individuales
const fieldErrors = reactive({
  title: '',
  description: '',
  categoryId: '',
  storeLocation: '',
  motorcycleModel: '',
})

type FieldName = keyof typeof fieldErrors

// Limpiar errores de validación
function clearErrors() {
  for (const key of Object.keys(fieldErrors) as FieldName[]) {
    fieldErrors[key] = ''
  }
}

// Cargar categorías desde el backend
async function loadCategories() {
  loadingCategories.value = true
  error.value = ''

  try {
    const response = await getCategories()
    categories.value = response.data
  } catch {
    error.value =
      'No se pudieron cargar las categorías. Intenta nuevamente.'
  } finally {
    loadingCategories.value = false
  }
}

// Validar campos obligatorios
function validate(): boolean {
  clearErrors()

  fieldErrors.title =
    form.title.trim().length >= 3
      ? ''
      : 'El título debe tener al menos 3 caracteres.'

  fieldErrors.description =
    form.description.trim().length >= 1
      ? ''
      : 'La descripción es obligatoria.'

  fieldErrors.categoryId =
    form.categoryId > 0
      ? ''
      : 'Selecciona una categoría.'

  fieldErrors.storeLocation =
    form.storeLocation.trim()
      ? ''
      : 'La tienda o ubicación es obligatoria.'

  fieldErrors.motorcycleModel =
    form.motorcycleModel.trim()
      ? ''
      : 'El modelo de motocicleta es obligatorio.'

  return !Object.values(fieldErrors).some(Boolean)
}

// Enfocar el primer campo con error
async function focusFirstError() {
  await nextTick()

  const firstInvalid = document.querySelector<HTMLElement>(
    'form [aria-invalid="true"]',
  )

  firstInvalid?.focus()
}

// Limpiar el formulario
function resetForm() {
  form.title = ''
  form.description = ''
  form.categoryId = 0
  form.storeLocation = ''
  form.motorcycleModel = ''

  clearErrors()
  aiSuggestion.value = null
  aiError.value = ''
}

// Crear otro ticket
function createAnotherTicket() {
  successId.value = null
  error.value = ''
  resetForm()
}

// --- LÓGICA DE LA IA ---

async function handleAISuggestion() {
  console.log('¡Hice clic en el botón de IA!', form.description)
  if (!form.description.trim()) {
    aiError.value = 'Escribe una descripción primero para que la IA pueda ayudarte.'
    return
  }
  
  generatingAI.value = true
  aiError.value = ''
  aiSuggestion.value = null
  
  try {
    const suggestion = await suggestTicketFields(form.description)
    aiSuggestion.value = suggestion
  } catch (err) {
    console.error('Error al generar sugerencia:', err) 
    aiError.value = 'No se pudo generar la sugerencia. Intenta de nuevo o continúa manualmente.'
  } finally {
    generatingAI.value = false
  }
}

function applyAISuggestion() {
  if (!aiSuggestion.value) return
  
  if (aiSuggestion.value.title) form.title = aiSuggestion.value.title
  if (aiSuggestion.value.description) form.description = aiSuggestion.value.description
  if (aiSuggestion.value.storeLocation) form.storeLocation = aiSuggestion.value.storeLocation
  if (aiSuggestion.value.motorcycleModel) form.motorcycleModel = aiSuggestion.value.motorcycleModel
  
  // Buscamos la categoría por nombre
  if (aiSuggestion.value.categoryName) {
    const cat = categories.value.find(c => c.name.toLowerCase().includes(aiSuggestion.value!.categoryName!.toLowerCase()))
    if (cat) form.categoryId = cat.id
  }
  
  aiSuggestion.value = null // Cerramos el panel
}

// Enviar formulario
async function submit() {
  // Evitar envíos duplicados
  if (saving.value) return

  error.value = ''
  successId.value = null

  // Validar antes del envío
  if (!validate()) {
    await focusFirstError()
    return
  }

  saving.value = true

  try {
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId,
      storeLocation: form.storeLocation.trim(),
      motorcycleModel: form.motorcycleModel.trim(),
    }

    const response = await createTicket(payload)

    // Confirmación de creación
    successId.value = response.data.id

    // Limpiar únicamente si se guardó correctamente
    resetForm()
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'Ocurrió un error al crear el ticket.'

    // Mostrar errores devueltos por el backend
    if (
      cause instanceof ApiError &&
      cause.details &&
      Array.isArray(cause.details)
    ) {
      for (const detail of cause.details) {
        if (
          detail &&
          typeof detail === 'object' &&
          'field' in detail &&
          'message' in detail &&
          typeof detail.field === 'string' &&
          typeof detail.message === 'string' &&
          Object.prototype.hasOwnProperty.call(
            fieldErrors,
            detail.field,
          )
        ) {
          fieldErrors[detail.field as FieldName] = detail.message
        }
      }

      await focusFirstError()
    }

  } finally {
    saving.value = false
  }
}

// Cargar categorías al abrir la pantalla
onMounted(loadCategories)
</script>

<template>
  <main class="page">
    <div class="card">

      <!-- Confirmación de creación -->
      <div
        v-if="successId !== null"
        class="success-card"
        role="status"
        aria-live="polite"
      >
        <h1>¡Ticket creado con éxito!</h1>
        <p>Tu solicitud de soporte se registró correctamente.</p>
        <p>Puedes consultar el seguimiento de tu ticket desde la sección Mis tickets.</p>
        <div class="ticket-id">#TK-{{ successId }}</div>
        <div class="actions">
          <RouterLink to="/my-tickets" class="btn btn-primary">Ver mis tickets</RouterLink>
          <button type="button" class="btn btn-secondary" @click="createAnotherTicket">Crear otro ticket</button>
        </div>
      </div>

      <!-- Formulario -->
      <div v-else>
        <RouterLink to="/tickets" class="back-link">← Volver a tickets</RouterLink>
        <h1>Crear ticket de soporte</h1>
        <p class="description">Completa la información para reportar tu problema técnico.</p>
        <p class="required-info">Los campos marcados con * son obligatorios.</p>

        <!-- Carga de categorías -->
        <p v-if="loadingCategories" class="loading-message" role="status">Cargando categorías disponibles...</p>

        <!-- Error al cargar categorías -->
        <div v-else-if="error && categories.length === 0" class="error-box" role="alert">
          <p>{{ error }}</p>
          <button type="button" class="btn btn-secondary" @click="loadCategories">Intentar nuevamente</button>
        </div>

        <!-- Formulario principal -->
        <form v-else @submit.prevent="submit" novalidate>

          <!-- Título -->
          <div class="form-group">
            <label for="title">Título del problema *</label>
            <input
              id="title"
              v-model="form.title"
              type="text"
              maxlength="200"
              autocomplete="off"
              placeholder="Ej. La motocicleta no enciende"
              :disabled="saving"
              :aria-invalid="!!fieldErrors.title"
              :aria-describedby="fieldErrors.title ? 'title-error' : undefined"
            />
            <span v-if="fieldErrors.title" id="title-error" class="error-text">{{ fieldErrors.title }}</span>
          </div>

          <!-- Descripción -->
          <div class="form-group">
            <label for="description">Descripción detallada *</label>
            <textarea
              id="description"
              v-model="form.description"
              rows="4"
              maxlength="5000"
              :disabled="saving"
              :aria-invalid="!!fieldErrors.description"
              :aria-describedby="fieldErrors.description ? 'description-error' : undefined"
              placeholder="Describe qué ocurrió, cuándo comenzó el problema y qué intentaste hacer."
            ></textarea>
            <span v-if="fieldErrors.description" id="description-error" class="error-text">{{ fieldErrors.description }}</span>
            
            <!-- Botón de IA debajo de la descripción -->
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 12px;">
              <button
                type="button"
                class="btn btn-secondary"
                @click="handleAISuggestion"
                :disabled="generatingAI || saving || !form.description.trim()"
                style="display: inline-flex; align-items: center; gap: 6px;"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                </svg>
                {{ generatingAI ? 'Generando sugerencia...' : 'Organizar con IA' }}
              </button>
            </div>
            <p v-if="aiError" class="error-text" style="margin-top: 8px;">{{ aiError }}</p>
          </div>

          <!-- Panel de revisión de IA -->
          <div v-if="aiSuggestion" class="ai-suggestion-card">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
              <h3 style="margin: 0; color: #166534; font-size: 16px;">Propuesta generada por IA</h3>
            </div>
            
            <p style="font-size: 13px; color: #15803d; margin-bottom: 12px;">Revisa que los datos sean correctos antes de aplicarlos. Puedes editarlos después.</p>
            
            <ul style="font-size: 14px; margin-bottom: 16px; padding-left: 20px; line-height: 1.6;">
              <li><strong>Título:</strong> {{ aiSuggestion.title }}</li>
              <li><strong>Descripción:</strong> {{ aiSuggestion.description }}</li>
              <li><strong>Categoría:</strong> {{ aiSuggestion.categoryName || 'No detectada' }}</li>
              <li v-if="aiSuggestion.storeLocation"><strong>Ubicación:</strong> {{ aiSuggestion.storeLocation }}</li>
              <li v-if="aiSuggestion.motorcycleModel"><strong>Motocicleta:</strong> {{ aiSuggestion.motorcycleModel }}</li>
            </ul>

            <div v-if="aiSuggestion.missingInformation.length > 0" style="background: #fef2f2; border: 1px solid #fecaca; padding: 10px; border-radius: 6px; margin-bottom: 16px;">
              <p style="color: #b91c1c; font-size: 13px; margin: 0;">
                <strong>Campos faltantes:</strong> La IA no pudo extraer esta información. Por favor, complétala manualmente: 
                {{ aiSuggestion.missingInformation.join(', ') }}
              </p>
            </div>
            
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-primary" @click="applyAISuggestion">Aplicar al formulario</button>
              <button type="button" class="btn btn-secondary" @click="aiSuggestion = null">Descartar</button>
            </div>
          </div>

          <div class="form-row">
            <!-- Categoría -->
            <div class="form-group">
              <label for="categoryId">Tipo de problema / Categoría *</label>
              <select
                id="categoryId"
                v-model="form.categoryId"
                :disabled="saving"
                :aria-invalid="!!fieldErrors.categoryId"
                :aria-describedby="fieldErrors.categoryId ? 'categoryId-error' : undefined"
              >
                <option :value="0" disabled>Selecciona una categoría</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
              </select>
              <span v-if="fieldErrors.categoryId" id="categoryId-error" class="error-text">{{ fieldErrors.categoryId }}</span>
            </div>

            <!-- Ubicación -->
            <div class="form-group">
              <label for="storeLocation">Tienda o ubicación *</label>
              <input
                id="storeLocation"
                v-model="form.storeLocation"
                type="text"
                maxlength="200"
                required
                placeholder="Ej. Sucursal Centro"
                :disabled="saving"
                :aria-invalid="!!fieldErrors.storeLocation"
                :aria-describedby="fieldErrors.storeLocation ? 'storeLocation-error' : undefined"
              />
              <span v-if="fieldErrors.storeLocation" id="storeLocation-error" class="error-text">{{ fieldErrors.storeLocation }}</span>
            </div>

            <!-- Modelo -->
            <div class="form-group">
              <label for="motorcycleModel">Modelo de motocicleta *</label>
              <input
                id="motorcycleModel"
                v-model="form.motorcycleModel"
                type="text"
                maxlength="200"
                required
                placeholder="Ej. Italika FT150"
                :disabled="saving"
                :aria-invalid="!!fieldErrors.motorcycleModel"
                :aria-describedby="fieldErrors.motorcycleModel ? 'motorcycleModel-error' : undefined"
              />
              <span v-if="fieldErrors.motorcycleModel" id="motorcycleModel-error" class="error-text">{{ fieldErrors.motorcycleModel }}</span>
            </div>
          </div>

          <!-- Error general -->
          <div v-if="error" class="error-box" role="alert">{{ error }}</div>

          <!-- Acciones -->
          <div class="actions">
            <button type="submit" class="btn btn-primary" :disabled="saving" :aria-busy="saving">
              {{ saving ? 'Guardando ticket...' : 'Crear ticket' }}
            </button>
            <RouterLink
              to="/tickets"
              class="btn btn-secondary"
              :aria-disabled="saving"
              :tabindex="saving ? -1 : undefined"
              @click="saving ? $event.preventDefault() : undefined"
            >
              Cancelar
            </RouterLink>
          </div>

          <p v-if="saving" class="loading-message" role="status">Estamos registrando tu solicitud. No cierres esta página mientras se guarda.</p>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* ... Conserva tus estilos originales ... */
.page {
  min-height: 100vh;
  padding: 32px 16px;
  background: var(--od-bg, #f8f9ff);
  color: var(--od-text, #0b1c30);
  font-family: 'Inter', Arial, sans-serif;
}

.card {
  max-width: 800px;
  margin: auto;
  padding: 32px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.05);
}

.back-link {
  color: #4f46e5;
  text-decoration: none;
  font-weight: 600;
  display: inline-block;
  margin-bottom: 16px;
}

.back-link:hover {
  text-decoration: underline;
}

h1 {
  margin: 0 0 8px;
  font-size: 24px;
}

.description {
  color: #64748b;
  margin-bottom: 12px;
  line-height: 1.5;
}

.required-info {
  color: #475569;
  font-size: 14px;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

label {
  font-weight: 600;
  font-size: 14px;
}

input,
select,
textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
  background: #fff;
  color: #0b1c30;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
  border-color: #4f46e5;
}

input[aria-invalid="true"],
select[aria-invalid="true"],
textarea[aria-invalid="true"] {
  border: 2px solid #b91c1c;
}

textarea {
  resize: vertical;
}

.error-text {
  color: #b91c1c;
  font-size: 12px;
  margin-top: 2px;
  line-height: 1.4;
}

.error-box {
  background: #fef2f2;
  color: #991b1b;
  padding: 16px;
  border-radius: 6px;
  margin-bottom: 20px;
  border: 1px solid #fecaca;
}

.error-box p {
  margin-top: 0;
}

.loading-message {
  padding: 12px 0;
  color: #475569;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.btn {
  padding: 10px 16px;
  border-radius: 6px;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  cursor: pointer;
  font: inherit;
  transition: background 0.2s;
}

.btn:focus-visible,
.back-link:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 3px;
}

.btn-primary {
  background: #4f46e5;
  color: #fff;
}

.btn-primary:hover {
  background: #4338ca;
}

.btn-primary:disabled {
  background: #a5b4fc;
  cursor: not-allowed;
}

.btn-secondary {
  background: #fff;
  color: #1e293b;
  border-color: #cbd5e1;
}

.btn-secondary:hover {
  background: #f8fafc;
}

.btn[aria-disabled="true"] {
  opacity: 0.6;
  cursor: not-allowed;
}

.success-card {
  text-align: center;
  padding: 40px 0;
}

.success-card h1 {
  color: #047857;
  margin-bottom: 12px;
}

.success-card p {
  color: #475569;
  line-height: 1.5;
}

.ticket-id {
  font-size: 32px;
  font-weight: 700;
  color: #4f46e5;
  margin: 20px 0;
  font-family: 'JetBrains Mono', monospace;
}

/* Estilos específicos para la tarjeta de IA */
.ai-suggestion-card {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .card {
    padding: 20px;
  }

  .page {
    padding: 16px;
  }

  .actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
    box-sizing: border-box;
  }
}
</style>