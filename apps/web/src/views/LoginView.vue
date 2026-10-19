<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiRequest, setToken } from '../services/api'
import { clearSession, refreshSession } from '../services/session'

interface LoginResponse {
  accessToken: string
}

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function login() {
  if (loading.value) return

  error.value = ''
  loading.value = true
  clearSession()

  try {
    const response = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: email.value.trim(),
        password: password.value,
      }),
    })

    setToken(response.data.accessToken)
    password.value = ''

    const user = await refreshSession()
    await router.replace(user?.permissions.includes('users:read:list') ? '/users' : '/knowledge/documents')
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo iniciar sesión.'
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

      <form :aria-busy="loading" @submit.prevent="login">
        <label for="email">Correo electrónico</label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="username"
          placeholder="correo@empresa.com"
          required
          :disabled="loading"
        />

        <label for="password">Contraseña</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          :disabled="loading"
        />

        <p v-if="error" class="error" role="alert">
          {{ error }}
        </p>

        <button type="submit" :disabled="loading">
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
  margin-bottom: 8px;
}

input:focus {
  outline: 2px solid #2457d6;
  outline-offset: 2px;
}

button {
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
}
</style>