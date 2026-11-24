<script setup lang="ts">
import PartsLookupPanel from '../components/PartsLookupPanel.vue'
</script>

<template>
  <main class="page">
    <div class="card">
      <RouterLink to="/" class="back-link">← Volver al inicio</RouterLink>
      <h1>Refacciones y existencias</h1>
      <p class="description">
        Busca refacciones por código o nombre, consulta existencias por ubicación y,
        con un VIN, las compatibles de una motocicleta concreta.
      </p>
      <PartsLookupPanel />
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
  max-width: 900px;
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

.back-link:hover { text-decoration: underline; }

h1 { margin: 0 0 8px; font-size: 24px; }

.description { color: #64748b; margin-bottom: 24px; line-height: 1.5; }

@media (max-width: 768px) {
  .card { padding: 20px; }
  .page { padding: 16px; }
}
</style>