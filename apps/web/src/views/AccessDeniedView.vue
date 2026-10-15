<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { clearSession } from '../services/session'

const route = useRoute()

const unavailable = computed(
  () => route.query.reason === 'unavailable',
)
</script>

<template>
  <main class="page">
    <section class="card">
      <h1>
        {{ unavailable ? 'No se pudo verificar el acceso' : 'Acceso denegado' }}
      </h1>

      <p>
        {{
          unavailable
            ? 'No pudimos consultar tus permisos. Comprueba la conexión y vuelve a intentar.'
            : 'Tu cuenta no tiene los permisos necesarios para esta pantalla.'
        }}
      </p>

      <div class="actions">
        <RouterLink to="/users">
          Volver a comprobar acceso
        </RouterLink>

        <RouterLink to="/login" @click="clearSession">
          Entrar con otra cuenta
        </RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #f8f9ff;
  color: #182338;
  font-family: Arial, sans-serif;
}

.card {
  max-width: 600px;
  padding: 32px;
  background: white;
  border: 1px solid #dce3ee;
  border-radius: 14px;
}

p {
  line-height: 1.6;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 24px;
}

a {
  color: #2457d6;
}
</style>