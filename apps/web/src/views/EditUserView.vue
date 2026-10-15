<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ApiError } from '../services/api'
import { useFormAccess } from '../composables/useFormAccess'
import {
  getUser,
  listRoles,
  updateUser,
} from '../services/users'

const route = useRoute()
const userId = Number(route.params.id)

const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const success = ref('')
const availableRoles = ref<string[]>([])
const active = ref(false)
const originalRoles = ref<string[]>([])

const form = reactive({
  name: '',
  email: '',
  roles: [] as string[],
})

const fieldErrors = reactive({
  name: '',
  email: '',
  roles: '',
})

const {
  authorized,
  ensureAccess,
  handleAccessError,
} = useFormAccess(
  ['users:read', 'users:update', 'users:assign:roles'],
  () => saving.value || loading.value,
  () => {
    form.name = ''
    form.email = ''
    form.roles = []
    originalRoles.value = []
    availableRoles.value = []
    active.value = false
    success.value = ''
  },
)

async function loadUser() {
  if (saving.value) return

  loading.value = true
  loadError.value = ''
  success.value = ''

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    loadError.value = 'El identificador del usuario no es válido.'
    loading.value = false
    return
  }

  try {
    if (!(await ensureAccess())) return

    const [userResponse, rolesResponse] = await Promise.all([
      getUser(userId),
      listRoles(),
    ])

    if (rolesResponse.data.length === 0) {
      throw new Error('No hay roles disponibles.')
    }

    const user = userResponse.data

    form.name = user.name
    form.email = user.email
    form.roles = [...user.roles]
    originalRoles.value = [...user.roles]
    active.value = user.active
    availableRoles.value = rolesResponse.data
  } catch (cause) {
    if (await handleAccessError(cause)) return

    loadError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo cargar el usuario.'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (
    !authorized.value ||
    saving.value ||
    loading.value ||
    loadError.value
  ) {
    return
  }

  saveError.value = ''
  success.value = ''

  const name = form.name.trim()
  const email = form.email.trim().toLowerCase()

  fieldErrors.name =
    name.length >= 2 && name.length <= 120
      ? ''
      : 'El nombre debe tener entre 2 y 120 caracteres.'

  fieldErrors.email =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? ''
      : 'Escribe un correo válido.'

  fieldErrors.roles =
    form.roles.length > 0 &&
    form.roles.every((role) => availableRoles.value.includes(role))
      ? ''
      : 'Selecciona al menos un rol válido.'

  if (Object.values(fieldErrors).some(Boolean)) return

  const rolesChanged =
    [...form.roles].sort().join('|') !==
    [...originalRoles.value].sort().join('|')

  if (
    rolesChanged &&
    !window.confirm(
      `¿Confirmas cambiar los roles de ${name} (${email})?`,
    )
  ) {
    return
  }

  saving.value = true

  try {
    if (!(await ensureAccess())) return

    const response = await updateUser(userId, {
      name,
      email,
      roles: [...form.roles],
    })

    form.name = response.data.name
    form.email = response.data.email
    form.roles = [...response.data.roles]
    originalRoles.value = [...response.data.roles]
    active.value = response.data.active

    success.value = 'Los cambios se guardaron correctamente.'
  } catch (cause) {
    if (await handleAccessError(cause)) return

    if (cause instanceof ApiError && cause.status === 409) {
      saveError.value = cause.message
    } else {
      saveError.value =
        cause instanceof Error
          ? cause.message
          : 'No se pudieron guardar los cambios.'
    }
  } finally {
    saving.value = false
  }
}

onMounted(loadUser)
</script>

<template>
  <main class="page">
    <section class="card">
      <RouterLink v-if="!saving" to="/users">
        ← Volver a usuarios
      </RouterLink>

      <h1>Consultar y editar usuario</h1>

      <p v-if="loading" role="status">
        Cargando usuario y roles…
      </p>

      <div v-else-if="loadError" class="error" role="alert">
        <p>{{ loadError }}</p>
        <button type="button" @click="loadUser">
          Reintentar
        </button>
      </div>

    <form
        v-else-if="authorized"
        :aria-busy="saving"
        @submit.prevent="save"
      >
        <p>
          Estado de la cuenta:
          <strong>{{ active ? 'Activo' : 'Inactivo' }}</strong>
        </p>

        <fieldset :disabled="saving">
          <label for="name">Nombre</label>
          <input
            id="name"
            v-model="form.name"
            minlength="2"
            maxlength="120"
            required
            :aria-invalid="!!fieldErrors.name"
            aria-describedby="name-error"
          />
          <span id="name-error" class="field-error">
            {{ fieldErrors.name }}
          </span>

          <label for="email">Correo electrónico</label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            required
            :aria-invalid="!!fieldErrors.email"
            aria-describedby="email-error"
          />
          <span id="email-error" class="field-error">
            {{ fieldErrors.email }}
          </span>

          <fieldset class="roles" aria-describedby="roles-error">
            <legend>Roles</legend>

            <label v-for="role in availableRoles" :key="role">
              <input
                v-model="form.roles"
                type="checkbox"
                :value="role"
              />
              {{ role }}
            </label>

            <span id="roles-error" class="field-error">
              {{ fieldErrors.roles }}
            </span>
          </fieldset>
        </fieldset>

        <p v-if="saveError" class="error" role="alert">
          {{ saveError }}
        </p>

        <p v-if="success" class="success" role="status">
          {{ success }}
        </p>

        <div class="actions">
          <button type="submit" :disabled="saving">
            {{ saving ? 'Guardando…' : 'Guardar cambios' }}
          </button>

          <RouterLink v-if="!saving" to="/users">
            Volver al listado
          </RouterLink>
        </div>
      </form>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 32px 16px;
  background: #f8f9ff;
  color: #182338;
  font-family: Arial, sans-serif;
}

.card {
  max-width: 650px;
  margin: auto;
  padding: 28px;
  background: white;
  border: 1px solid #dce3ee;
  border-radius: 14px;
}

a {
  color: #2457d6;
}

h1 {
  margin-top: 24px;
}

p {
  line-height: 1.5;
}

fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

label,
legend {
  font-weight: 600;
}

input:not([type='checkbox']) {
  width: 100%;
  padding: 12px;
  border: 1px solid #b7c3d4;
  border-radius: 8px;
  font: inherit;
}

input:focus,
button:focus-visible,
a:focus-visible {
  outline: 2px solid #2457d6;
  outline-offset: 2px;
}

.field-error {
  min-height: 18px;
  color: #a52121;
  font-size: 14px;
  margin-bottom: 8px;
}

fieldset.roles {
  border: 1px solid #dce3ee;
  border-radius: 8px;
  padding: 16px;
  margin-top: 8px;
}

.roles label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 400;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  margin-top: 24px;
}

button {
  padding: 12px 20px;
  background: #2457d6;
  color: white;
  border: 0;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
}

button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.error,
.success {
  padding: 12px;
  border-radius: 8px;
  overflow-wrap: anywhere;
}

.error {
  background: #fff0f0;
  color: #a52121;
}

.success {
  background: #e7f6ed;
  color: #17663a;
}
</style>