<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError } from '../services/api'
import { createUser, listRoles } from '../services/users'
import { useFormAccess } from '../composables/useFormAccess'

const router = useRouter()
const saving = ref(false)
const error = ref('')

const availableRoles = ref<string[]>([])
const loadingRoles = ref(true)
const rolesError = ref('')

const form = reactive({
  name: '',
  email: '',
  password: '',
  roles: [] as string[],
})

const fieldErrors = reactive({
  name: '',
  email: '',
  password: '',
  roles: '',
})

const {
  authorized,
  ensureAccess,
  handleAccessError,
} = useFormAccess(
  ['users:create', 'users:assign:roles'],
  () => saving.value || loadingRoles.value,
  () => {
    form.name = ''
    form.email = ''
    form.password = ''
    form.roles = []
    availableRoles.value = []
  },
)

const blocked = computed(
  () =>
    !authorized.value ||
    saving.value ||
    loadingRoles.value ||
    !!rolesError.value,
)

async function loadRoles() {
  if (saving.value) return

  loadingRoles.value = true
  rolesError.value = ''

  try {
    if (!(await ensureAccess())) return

    const response = await listRoles()
    availableRoles.value = response.data

    if (response.data.length === 0) {
      rolesError.value = 'No hay roles disponibles para crear cuentas.'
    }

    form.roles = form.roles.filter((role) =>
      response.data.includes(role),
    )
  } catch (cause) {
    if (await handleAccessError(cause)) return

    rolesError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudieron cargar los roles.'
  } finally {
    loadingRoles.value = false
  }
}

async function save() {
  if (blocked.value) return

  error.value = ''

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

  fieldErrors.password =
    form.password.length >= 10 && form.password.length <= 128
      ? ''
      : 'Usa una contraseña de entre 10 y 128 caracteres.'

  fieldErrors.roles =
    form.roles.length > 0 &&
    form.roles.every((role) => availableRoles.value.includes(role))
      ? ''
      : 'Selecciona al menos un rol válido.'

  if (Object.values(fieldErrors).some(Boolean)) return

  saving.value = true

  try {
    if (!(await ensureAccess())) return

    await createUser({
      name,
      email,
      password: form.password,
      roles: [...form.roles],
    })

    form.password = ''
    await router.push('/users')
  } catch (cause) {
    if (await handleAccessError(cause)) return

    if (cause instanceof ApiError && cause.status === 409) {
      fieldErrors.email = cause.message
    } else {
      error.value =
        cause instanceof Error
          ? cause.message
          : 'No se pudo crear la cuenta.'
    }
  } finally {
    saving.value = false
  }
}

onMounted(loadRoles)
</script>

<template>
  <main class="page">
    <section class="card">
      <RouterLink v-if="!saving" to="/users">
        ← Volver a usuarios
      </RouterLink>

      <h1>Crear usuario</h1>
      <p>
        La cuenta se creará activa. Para registrar un técnico,
        selecciona el rol Technician.
      </p>

      <p v-if="loadingRoles" role="status">
        Cargando roles…
      </p>

      <div v-if="rolesError" class="error" role="alert">
        <p>{{ rolesError }}</p>
        <button
          type="button"
          :disabled="loadingRoles || saving"
          @click="loadRoles"
        >
          Reintentar
        </button>
      </div>

      <form
        v-if="authorized"
        :aria-busy="saving || loadingRoles"
        @submit.prevent="save"
      >
        <fieldset :disabled="blocked">
          <label for="name">Nombre</label>
          <input
            id="name"
            v-model="form.name"
            autocomplete="name"
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
            autocomplete="off"
            required
            :aria-invalid="!!fieldErrors.email"
            aria-describedby="email-error"
          />
          <span id="email-error" class="field-error">
            {{ fieldErrors.email }}
          </span>

          <label for="password">Contraseña inicial</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            minlength="10"
            maxlength="128"
            required
            :aria-invalid="!!fieldErrors.password"
            aria-describedby="password-help password-error"
          />
          <small id="password-help">
            Usa entre 10 y 128 caracteres.
          </small>
          <span id="password-error" class="field-error">
            {{ fieldErrors.password }}
          </span>

          <fieldset
            class="roles"
            :aria-invalid="!!fieldErrors.roles"
            aria-describedby="roles-error"
          >
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

        <p v-if="error" class="error" role="alert">
          {{ error }}
        </p>

        <div class="actions">
          <button type="submit" :disabled="blocked">
            {{ saving ? 'Guardando…' : 'Crear usuario' }}
          </button>

          <RouterLink v-if="!saving" to="/users">
            Cancelar
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

small {
  color: #5f6b7a;
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
  cursor: default;
}

.error {
  padding: 12px;
  background: #fff0f0;
  color: #a52121;
  border-radius: 8px;
  overflow-wrap: anywhere;
}
</style>