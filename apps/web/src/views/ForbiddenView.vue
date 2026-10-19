<template>
  <section class="card">
    <h1 data-testid="forbidden-title">Acceso denegado</h1>
    <p>No tienes permiso para acceder a esta sección.</p>
    <RouterLink :to="{ name: 'dashboard' }">Volver al inicio</RouterLink>
  </section>
</template>
