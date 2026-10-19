<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/http'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<{ email?: string; password?: string }>({})

const expired = computed(() => route.query.reason === 'expired')

/** Solo permite redirecciones a rutas internas. */
function safeRedirect(): string {
  const redirect = route.query.redirect

  if (
    typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    !redirect.startsWith('//') &&
    !redirect.includes('\\')
  ) {
    return redirect
  }

  // Mantiene la navegación según los permisos del usuario.
  return session.can('users:read:list')
    ? '/users'
    : '/knowledge/documents'
}

function validate(): boolean {
  fieldErrors.value = {}

  if (!email.value.trim()) {
    fieldErrors.value.email = 'El correo es obligatorio.'
  }

  if (!password.value) {
    fieldErrors.value.password = 'La contraseña es obligatoria.'
  }

  return Object.keys(fieldErrors.value).length === 0
}

async function onSubmit() {
  if (loading.value) return

  errorMessage.value = ''

  if (!validate()) return

  loading.value = true

  try {
    await session.login(email.value.trim(), password.value)
    password.value = ''

    await router.replace(safeRedirect())
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'network') {
      errorMessage.value =
        'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
    } else if (e instanceof ApiError && e.kind === 'server') {
      errorMessage.value =
        'El servidor tuvo un problema. Inténtalo de nuevo más tarde.'
    } else if (e instanceof ApiError && e.status === 400) {
      errorMessage.value = 'Revisa los datos ingresados.'
    } else {
      // No revelar si la cuenta existe o si la contraseña es incorrecta.
      errorMessage.value = 'Correo o contraseña incorrectos.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <div class="brand">OmniDesk</div>

      <h1>Iniciar sesión</h1>

      <p class="description">
        Inicia sesión con tu cuenta. El acceso depende de tus permisos.
      </p>

      <p
        v-if="expired"
        class="info"
        data-testid="login-expired"
      >
        Tu sesión terminó. Inicia sesión de nuevo.
      </p>

      <form
        novalidate
        :aria-busy="loading"
        @submit.prevent="onSubmit"
      >
        <label for="email">Correo electrónico</label>

        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="username"
          placeholder="correo@empresa.com"
          data-testid="login-email"
          :disabled="loading"
          :aria-invalid="!!fieldErrors.email"
          required
        />

        <p
          v-if="fieldErrors.email"
          class="error"
          data-testid="login-email-error"
        >
          {{ fieldErrors.email }}
        </p>

        <label for="password">Contraseña</label>

        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          data-testid="login-password"
          :disabled="loading"
          :aria-invalid="!!fieldErrors.password"
          required
        />

        <p
          v-if="fieldErrors.password"
          class="error"
          data-testid="login-password-error"
        >
          {{ fieldErrors.password }}
        </p>

        <p
          v-if="errorMessage"
          class="error"
          role="alert"
          data-testid="login-error"
        >
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          :disabled="loading"
          data-testid="login-submit"
        >
          {{ loading ? 'Iniciando sesión…' : 'Iniciar sesión' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #f8f9ff;
  color: #182338;
  font-family: Arial, sans-serif;
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 32px;
  background: white;
  border: 1px solid #dce3ee;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgb(24 35 56 / 8%);
}

.brand {
  color: #2457d6;
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 24px;
}

h1 {
  font-size: 23px;
  margin: 0 0 12px;
}

.description {
  color: #5f6b7a;
  line-height: 1.5;
  margin-bottom: 24px;
}

form {
  display: grid;
  gap: 12px;
}

label {
  font-weight: 600;
}

input {
  width: 100%;
  padding: 12px;
  border: 1px solid #b7c3d4;
  border-radius: 8px;
  font: inherit;
}

input:focus {
  outline: 2px solid #2457d6;
  outline-offset: 2px;
}

button {
  margin-top: 12px;
  padding: 13px;
  border: 0;
  border-radius: 8px;
  background: #2457d6;
  color: white;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.error {
  color: #a52121;
  background: #fff0f0;
  padding: 12px;
  border-radius: 8px;
  overflow-wrap: anywhere;
  margin: 0;
}

.info {
  color: #2457a7;
  background: #edf4ff;
  padding: 12px;
  border-radius: 8px;
  line-height: 1.5;
}
</style>