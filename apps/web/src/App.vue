<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="library-entry"><RouterLink to="/knowledge/documents">Manuales y documentación</RouterLink></div>
  <RouterView />
</template>

<style>
.library-entry { padding: 10px 24px; font: 14px Arial,sans-serif; background: #edf1fb; }
.library-entry a { color: #2457d6; }
body {
  margin: 0;
}

* {
  box-sizing: border-box;
}
</style>