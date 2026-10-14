<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError, clearToken } from '../services/api'
import {
  listUsers,
  setUserStatus,
  type User,
} from '../services/users'

const router = useRouter()

const users = ref<User[]>([])
const search = ref('')
const role = ref('')
const active = ref('')
const page = ref(1)
const limit = 10
const total = ref(0)

const loading = ref(false)
const changingStatus = ref(false)
const changingUserId = ref<number | null>(null)

const loadError = ref('')
const actionError = ref('')
const success = ref('')

const roles = [
  'Employee',
  'Technician',
  'Service Advisor',
  'Manager',
  'Administrator',
]

const busy = computed(
  () => loading.value || changingStatus.value,
)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / limit)),
)

function getFilters() {
  return {
    search: search.value,
    role: role.value,
    active:
      active.value === ''
        ? undefined
        : active.value === 'true',
    page: page.value,
    limit,
  }
}

async function loadUsers() {
  if (loading.value) return

  loading.value = true
  loadError.value = ''

  try {
    const response = await listUsers(getFilters())

    users.value = response.data
    total.value = response.meta?.total ?? response.data.length

    if (page.value > totalPages.value) {
      page.value = totalPages.value

      const adjusted = await listUsers(getFilters())

      users.value = adjusted.data
      total.value = adjusted.meta?.total ?? adjusted.data.length
    }
  } catch (cause) {
    users.value = []
    total.value = 0

    if (cause instanceof ApiError && cause.status === 401) {
      await router.replace('/login')
      return
    }

    loadError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudieron cargar los usuarios.'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  if (busy.value) return

  page.value = 1
  actionError.value = ''
  success.value = ''
  void loadUsers()
}

function resetFilters() {
  if (busy.value) return

  search.value = ''
  role.value = ''
  active.value = ''
  applyFilters()
}

function changePage(nextPage: number) {
  if (
    busy.value ||
    nextPage < 1 ||
    nextPage > totalPages.value
  ) {
    return
  }

  page.value = nextPage
  actionError.value = ''
  success.value = ''
  void loadUsers()
}

async function toggleStatus(user: User) {
  if (busy.value) return

  const nextActive = !user.active
  const action = nextActive ? 'activar' : 'desactivar'

  const confirmed = window.confirm(
    `¿Deseas ${action} la cuenta de ${user.name} (${user.email})?`,
  )

  if (!confirmed) return

  changingStatus.value = true
  changingUserId.value = user.id
  actionError.value = ''
  success.value = ''

  try {
    await setUserStatus(user.id, nextActive)

    success.value = `La cuenta de ${user.name} se ${
      nextActive ? 'activó' : 'desactivó'
    } correctamente.`

    await loadUsers()
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      await router.replace('/login')
      return
    }

    actionError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo cambiar el estado de la cuenta.'
  } finally {
    changingStatus.value = false
    changingUserId.value = null
  }
}

async function logout() {
  if (busy.value) return

  clearToken()
  await router.replace('/login')
}

onMounted(loadUsers)
</script>

<template>
  <main class="users-page">
    <header class="page-header">
      <div>
        <span class="brand">OmniDesk</span>
        <h1>Usuarios y técnicos</h1>
        <p>Consulta las cuentas, sus roles y su estado de acceso.</p>
      </div>

      <div class="header-actions">
        <RouterLink
          v-if="!busy"
          class="create-link"
          to="/users/new"
        >
          + Crear usuario
        </RouterLink>

        <button
          class="secondary"
          :disabled="busy"
          @click="logout"
        >
          Cerrar sesión
        </button>
      </div>
    </header>

    <section class="card" :aria-busy="busy">
      <form class="filters" @submit.prevent="applyFilters">
        <div class="field">
          <label for="search">Buscar</label>
          <input
            id="search"
            v-model="search"
            placeholder="Nombre o correo"
            maxlength="200"
            :disabled="busy"
          />
        </div>

        <div class="field">
          <label for="role">Rol</label>
          <select id="role" v-model="role" :disabled="busy">
            <option value="">Todos los roles</option>
            <option
              v-for="item in roles"
              :key="item"
              :value="item"
            >
              {{ item }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="active">Estado</label>
          <select
            id="active"
            v-model="active"
            :disabled="busy"
          >
            <option value="">Todos los estados</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>

        <button type="submit" :disabled="busy">
          Buscar
        </button>

        <button
          type="button"
          class="secondary"
          :disabled="busy"
          @click="resetFilters"
        >
          Limpiar
        </button>
      </form>

      <p v-if="success" class="success" role="status">
        {{ success }}
      </p>

      <p v-if="actionError" class="error" role="alert">
        {{ actionError }}
      </p>

      <p v-if="loading" role="status">
        Cargando usuarios…
      </p>

      <div
        v-else-if="loadError"
        class="error"
        role="alert"
      >
        <p>{{ loadError }}</p>
        <button
          class="secondary"
          :disabled="busy"
          @click="loadUsers"
        >
          Reintentar
        </button>
      </div>

      <p v-else-if="users.length === 0">
        No se encontraron usuarios con estos criterios.
      </p>

      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Correo electrónico</th>
              <th scope="col">Roles</th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.name }}</td>
              <td>{{ user.email }}</td>
              <td>{{ user.roles.join(', ') }}</td>

              <td>
                <span
                  class="badge"
                  :class="user.active ? 'active' : 'inactive'"
                >
                  {{ user.active ? 'Activo' : 'Inactivo' }}
                </span>
              </td>

              <td>
                <div class="row-actions">
                  <RouterLink
                    v-if="!busy"
                    class="edit-link"
                    :to="`/users/${user.id}/edit`"
                    :aria-label="`Editar a ${user.name}`"
                  >
                    Editar
                  </RouterLink>

                  <button
                    class="secondary"
                    :disabled="busy"
                    :aria-label="`${user.active ? 'Desactivar' : 'Activar'} a ${user.name}`"
                    @click="toggleStatus(user)"
                  >
                    {{
                      changingUserId === user.id
                        ? 'Guardando…'
                        : user.active
                          ? 'Desactivar'
                          : 'Activar'
                    }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer
        v-if="!loadError && !loading"
        class="pagination"
      >
        <span>
          {{ total }} usuarios · Página {{ page }} de {{ totalPages }}
        </span>

        <div class="pagination-buttons">
          <button
            class="secondary"
            :disabled="busy || page <= 1"
            @click="changePage(page - 1)"
          >
            Anterior
          </button>

          <button
            class="secondary"
            :disabled="busy || page >= totalPages"
            @click="changePage(page + 1)"
          >
            Siguiente
          </button>
        </div>
      </footer>
    </section>
  </main>
</template>

<style scoped>
.users-page {
  min-height: 100vh;
  padding: 32px;
  background: #f8f9ff;
  color: #182338;
  font-family: Arial, sans-serif;
}

.page-header {
  max-width: 1200px;
  margin: 0 auto 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.header-actions,
.row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.brand {
  color: #2457d6;
  font-size: 24px;
  font-weight: 700;
}

h1 {
  margin-bottom: 8px;
}

.page-header p {
  color: #5f6b7a;
  line-height: 1.5;
}

.card {
  max-width: 1200px;
  margin: auto;
  padding: 24px;
  background: white;
  border: 1px solid #dce3ee;
  border-radius: 14px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px;
  margin-bottom: 24px;
}

.field {
  display: grid;
  gap: 8px;
  flex: 1 1 180px;
}

label {
  font-weight: 600;
}

input,
select,
button,
.create-link,
.edit-link {
  font: inherit;
  border-radius: 8px;
  padding: 11px 14px;
}

input,
select {
  width: 100%;
  border: 1px solid #b7c3d4;
  background: white;
  color: #182338;
}

button,
.create-link {
  border: 1px solid #2457d6;
  background: #2457d6;
  color: white;
  cursor: pointer;
}

.create-link,
.edit-link {
  display: inline-block;
  text-decoration: none;
  white-space: nowrap;
}

.edit-link {
  border: 1px solid #2457d6;
  background: white;
  color: #2457d6;
}

button.secondary {
  background: white;
  color: #2457d6;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

input:focus,
select:focus,
button:focus-visible,
.create-link:focus-visible,
.edit-link:focus-visible {
  outline: 2px solid #2457d6;
  outline-offset: 2px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

th,
td {
  padding: 16px 12px;
  border-bottom: 1px solid #e4e9f1;
}

th {
  color: #5f6b7a;
  background: #f8f9ff;
}

.badge {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
}

.active {
  color: #17663a;
  background: #e7f6ed;
}

.inactive {
  color: #646b75;
  background: #edf0f4;
}

.pagination {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
  color: #5f6b7a;
}

.pagination-buttons {
  display: flex;
  gap: 8px;
}

.error,
.success {
  padding: 16px;
  border-radius: 8px;
  overflow-wrap: anywhere;
}

.error {
  color: #a52121;
  background: #fff0f0;
}

.success {
  color: #17663a;
  background: #e7f6ed;
}

@media (max-width: 600px) {
  .users-page {
    padding: 16px;
  }

  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>