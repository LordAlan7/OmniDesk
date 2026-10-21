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

/** Solo rutas internas: evita redirecciones abiertas (?redirect=https://sitio-malo.com). */
function safeRedirect(): string {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/'
}

function validate(): boolean {
  fieldErrors.value = {}
  if (!email.value.trim()) fieldErrors.value.email = 'El correo es obligatorio.'
  if (!password.value) fieldErrors.value.password = 'La contraseña es obligatoria.'
  return Object.keys(fieldErrors.value).length === 0
}

async function onSubmit() {
  errorMessage.value = ''
  if (!validate()) return // campos vacíos: no se envía
  loading.value = true
  try {
    await session.login(email.value.trim(), password.value)
    await router.replace(safeRedirect())
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'network') {
      errorMessage.value = 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
    } else if (e instanceof ApiError && e.kind === 'server') {
      errorMessage.value = 'El servidor tuvo un problema. Inténtalo de nuevo más tarde.'
    } else if (e instanceof ApiError && e.status === 429) {
      errorMessage.value = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
    } else if (e instanceof ApiError && e.status === 400) {
      errorMessage.value = 'Revisa los datos ingresados.'
    } else {
      // Mensaje genérico: no revela si la cuenta existe, está inactiva o la contraseña es incorrecta.
      errorMessage.value = 'Correo o contraseña incorrectos.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="card" style="max-width: 24rem; margin: 4rem auto">
    <h1>Iniciar sesión</h1>
    <p v-if="expired" class="info" data-testid="login-expired">Tu sesión terminó. Inicia sesión de nuevo.</p>
    <form novalidate @submit.prevent="onSubmit">
      <label for="email">Correo electrónico</label>
      <input id="email" v-model="email" type="email" autocomplete="username" data-testid="login-email" />
      <p v-if="fieldErrors.email" class="error" data-testid="login-email-error">{{ fieldErrors.email }}</p>

      <label for="password">Contraseña</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" data-testid="login-password" />
      <p v-if="fieldErrors.password" class="error" data-testid="login-password-error">{{ fieldErrors.password }}</p>

      <p v-if="errorMessage" class="error" role="alert" data-testid="login-error">{{ errorMessage }}</p>

      <button type="submit" :disabled="loading" data-testid="login-submit" style="margin-top: 1.5rem">
        {{ loading ? 'Ingresando…' : 'Ingresar' }}
      </button>
    </form>
  </section>
</template>
