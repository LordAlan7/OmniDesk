
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const canOpenTickets = computed(() =>
  session.can('tickets:read:all') ||
  (
    session.user?.roles.includes('Technician') === true &&
    session.can('tickets:read')
  ),
)

const opciones = computed(() => [
  {
    titulo: 'Crear ticket',
    descripcion: 'Reporta un problema o solicita soporte.',
    ruta: '/tickets/new',
    visible: session.can('tickets:create'),
  },
  {
    titulo: 'Mis tickets',
    descripcion: 'Consulta el seguimiento de tus solicitudes.',
    ruta: '/my-tickets',
    visible: session.can('tickets:read'),
  },
  {
    titulo: 'Consultar tickets',
    descripcion:
      'Consulta los tickets que puedes atender o supervisar.',
    ruta: '/tickets',
    visible: canOpenTickets.value,
  },
  {
    titulo: 'Gestión de usuarios',
    descripcion: 'Consulta las cuentas registradas.',
    ruta: '/users',
    visible: session.can('users:read:list'),
  },
  {
    titulo: 'Biblioteca de documentos',
    descripcion: 'Consulta los documentos de conocimiento.',
    ruta: '/knowledge/documents',
    visible: session.can('knowledge:read'),
  },
].filter(opcion => opcion.visible))
</script>

<template>
  <main class="dashboard">
    <header class="dashboard-header">
      <h1 data-testid="dashboard-title">
        Hola, {{ session.user?.name }}
      </h1>

      <p>
        Bienvenido a OmniDesk. Selecciona la tarea
        que deseas realizar.
      </p>

      <p class="roles">
        Rol(es):
        <span data-testid="dashboard-roles">
          {{ session.user?.roles.join(', ') }}
        </span>
      </p>
    </header>

    <section aria-labelledby="acciones-titulo">
      <h2 id="acciones-titulo">
        Accesos principales
      </h2>

      <div
        v-if="opciones.length"
        class="opciones-grid"
      >
        <RouterLink
          v-for="opcion in opciones"
          :key="opcion.ruta"
          :to="opcion.ruta"
          class="opcion-card"
        >
          <h3>{{ opcion.titulo }}</h3>
          <p>{{ opcion.descripcion }}</p>
          <span class="enlace">
            Abrir sección →
          </span>
        </RouterLink>
      </div>

      <p
        v-else
        class="sin-opciones"
        role="status"
      >
        Tu cuenta no tiene accesos disponibles.
        Contacta al administrador si necesitas permisos.
      </p>
    </section>
  </main>
</template>

<style scoped>
.dashboard {
  padding: 24px;
  max-width: 1100px;
  margin: 0 auto;
}

.dashboard-header {
  margin-bottom: 32px;
}

.dashboard-header h1 {
  margin-bottom: 8px;
}

.dashboard-header p {
  color: #64748b;
}

.roles {
  font-size: 14px;
}

.opciones-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(240px, 1fr)
  );
  gap: 18px;
  margin-top: 20px;
}

.opcion-card {
  display: block;
  padding: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  background: #ffffff;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.opcion-card:hover {
  border-color: #2563eb;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.opcion-card:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 3px;
}

.opcion-card h3 {
  margin: 0 0 10px;
  color: #1e293b;
}

.opcion-card p {
  color: #64748b;
  line-height: 1.5;
}

.enlace {
  display: inline-block;
  margin-top: 12px;
  font-weight: 600;
  color: #2563eb;
}

.sin-opciones {
  padding: 20px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

@media (max-width: 600px) {
  .dashboard {
    padding: 16px;
  }

  .opciones-grid {
    grid-template-columns: 1fr;
  }
}
</style>
