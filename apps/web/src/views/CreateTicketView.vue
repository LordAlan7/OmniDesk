<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError } from '../services/api'
import { createTicket, getCategories, type Category } from '../services/tickets'

const router = useRouter()
const saving = ref(false)
const error = ref('')
const successId = ref<number | null>(null)

const categories = ref<Category[]>([])
const loadingCategories = ref(true)

const form = reactive({
  title: '',
  description: '',
  categoryId: 0,
  storeLocation: '',
  motorcycleModel: '',
})

const fieldErrors = reactive({
  title: '',
  description: '',
  categoryId: '',
})

async function loadCategories() {
  loadingCategories.value = true
  try {
    const response = await getCategories()
    categories.value = response.data
  } catch (e) {
    error.value = 'No se pudieron cargar las categorías. Intenta recargar la página.'
  } finally {
    loadingCategories.value = false
  }
}

function validate(): boolean {
  let isValid = true
  fieldErrors.title = form.title.trim().length >= 3 ? '' : 'El título debe tener al menos 3 caracteres.'
  fieldErrors.description = form.description.trim().length >= 1 ? '' : 'La descripción es obligatoria.'
  fieldErrors.categoryId = form.categoryId ? '' : 'Selecciona una categoría.'

  if (fieldErrors.title || fieldErrors.description || fieldErrors.categoryId) {
    isValid = false
  }
  return isValid
}

async function submit() {
  if (saving.value) return

  error.value = ''
  successId.value = null
  Object.keys(fieldErrors).forEach(k => (fieldErrors[k as keyof typeof fieldErrors] = ''))

  if (!validate()) return

  saving.value = true
  try {
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId,
      storeLocation: form.storeLocation.trim() || null,
      motorcycleModel: form.motorcycleModel.trim() || null,
    }
    const response = await createTicket(payload)
    successId.value = response.data.id
    
    // Limpiar formulario tras éxito
    form.title = ''
    form.description = ''
    form.categoryId = 0
    form.storeLocation = ''
    form.motorcycleModel = ''
  } catch (cause) {
    if (cause instanceof ApiError && cause.details && Array.isArray(cause.details)) {
      cause.details.forEach((detail: any) => {
        if (detail.field && typeof detail.message === 'string') {
          if (detail.field in fieldErrors) {
            fieldErrors[detail.field as keyof typeof fieldErrors] = detail.message
          }
        }
      })
    } else {
      error.value = cause instanceof Error ? cause.message : 'Ocurrió un error al crear el ticket.'
    }
  } finally {
    saving.value = false
  }
}

onMounted(loadCategories)
</script>

<template>
  <main class="page">
    <div class="card">
      <div v-if="successId" class="success-card">
        <h2>¡Ticket creado con éxito!</h2>
        <p>Tu ticket ha sido registrado con el identificador:</p>
        <div class="ticket-id">#TK-{{ successId }}</div>
        <div class="actions">
          <RouterLink to="/tickets" class="btn btn-primary">Ver mis tickets</RouterLink>
          <button class="btn btn-secondary" @click="successId = null">Crear otro ticket</button>
        </div>
      </div>

      <div v-else>
        <RouterLink to="/tickets" class="back-link">← Volver a tickets</RouterLink>
        <h1>Crear ticket de soporte</h1>
        <p class="description">Completa la información para reportar tu problema técnico.</p>

        <p v-if="loadingCategories" role="status">Cargando catálogos...</p>
        <div v-else-if="error && categories.length === 0" class="error-box">{{ error }}</div>

        <form v-else @submit.prevent="submit" novalidate>
          <div class="form-group">
            <label for="title">Título del problema *</label>
            <input
              id="title"
              v-model="form.title"
              type="text"
              maxlength="200"
              :disabled="saving"
              :aria-invalid="!!fieldErrors.title"
            />
            <span v-if="fieldErrors.title" class="error-text">{{ fieldErrors.title }}</span>
          </div>

          <div class="form-group">
            <label for="description">Descripción detallada *</label>
            <textarea
              id="description"
              v-model="form.description"
              rows="4"
              maxlength="5000"
              :disabled="saving"
              :aria-invalid="!!fieldErrors.description"
              placeholder="Explica lo ocurrido. No envíes solo espacios."
            ></textarea>
            <span v-if="fieldErrors.description" class="error-text">{{ fieldErrors.description }}</span>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="categoryId">Tipo de problema / Categoría *</label>
              <select
                id="categoryId"
                v-model="form.categoryId"
                :disabled="saving"
                :aria-invalid="!!fieldErrors.categoryId"
              >
                <option :value="0" disabled>Selecciona una categoría</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </option>
              </select>
              <span v-if="fieldErrors.categoryId" class="error-text">{{ fieldErrors.categoryId }}</span>
            </div>

            <div class="form-group">
              <label for="storeLocation">Tienda o ubicación</label>
              <input
                id="storeLocation"
                v-model="form.storeLocation"
                type="text"
                maxlength="200"
                :disabled="saving"
                placeholder="Ej. Sucursal Centro (Opcional)"
              />
            </div>

            <div class="form-group">
              <label for="motorcycleModel">Modelo de motocicleta</label>
              <input
                id="motorcycleModel"
                v-model="form.motorcycleModel"
                type="text"
                maxlength="200"
                :disabled="saving"
                placeholder="Ej. Italika FT150 (Opcional)"
              />
            </div>
          </div>

          <div v-if="error" class="error-box" role="alert">{{ error }}</div>

          <div class="actions">
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Guardando...' : 'Crear ticket' }}
            </button>
            <RouterLink to="/tickets" class="btn btn-secondary">Cancelar</RouterLink>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
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

h1 { margin: 0 0 8px; font-size: 24px; }
.description { color: #64748b; margin-bottom: 24px; }

.form-group {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 20px;
}

@media (max-width: 768px) {
  .form-row { grid-template-columns: 1fr; }
}

label { font-weight: 600; font-size: 14px; }

input, select, textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}

textarea { resize: vertical; }

.error-text { color: #b91c1c; font-size: 12px; margin-top: 2px; }

.error-box {
  background: #fef2f2;
  color: #b91c1c;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 20px;
  border: 1px solid #fecaca;
}

.actions {
  display: flex;
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
  transition: background 0.2s;
}

.btn-primary {
  background: #4f46e5;
  color: #fff;
}
.btn-primary:hover { background: #4338ca; }
.btn-primary:disabled { background: #c7d2fe; cursor: not-allowed; }

.btn-secondary {
  background: #fff;
  color: #1e293b;
  border-color: #cbd5e1;
}
.btn-secondary:hover { background: #f8fafc; }

.success-card {
  text-align: center;
  padding: 40px 0;
}
.success-card h2 { color: #047857; margin-bottom: 8px; }
.success-card p { color: #64748b; }
.ticket-id {
  font-size: 32px;
  font-weight: 700;
  color: #4f46e5;
  margin: 16px 0;
  font-family: 'JetBrains Mono', monospace;
}
</style>