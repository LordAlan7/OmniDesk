<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
} from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError } from '@/api/http'
import {
  clearSession,
  hasEveryPermission,
  hasPermission,
  refreshSession,
} from '../services/session'
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

const canRead = computed(
  () => hasPermission('users:read:list'),
)

const canCreate = computed(() =>
  hasEveryPermission('users:create', 'users:assign:roles'),
)

const canEdit = computed(() =>
  hasEveryPermission(
    'users:read',
    'users:update',
    'users:assign:roles',
  ),
)

const canChangeStatus = computed(
  () => hasPermission('users:deactivate'),
)

const hasActions = computed(
  () => canEdit.value || canChangeStatus.value,
)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / limit)),
)

let refreshTimer: ReturnType<typeof setInterval> | undefined
let disposed = false

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

function discardUsers() {
  users.value = []
  total.value = 0
}

async function checkAccess(): Promise<boolean> {
  const user = await refreshSession()

  if (disposed) return false

  if (!user) {
    discardUsers()
    await router.replace('/login')
    return false
  }

  if (!hasPermission('users:read:list')) {
    discardUsers()
    await router.replace('/access-denied')
    return false
  }

  return true
}

async function handleAccessError(cause: unknown): Promise<boolean> {
  if (!(cause instanceof ApiError)) return false

  if (cause.status === 401) {
    discardUsers()
    clearSession()
    await router.replace('/login')
    return true
  }

  if (cause.status === 403) {
    discardUsers()
    await refreshSession()
    await router.replace('/access-denied')
    return true
  }

  return false
}

async function loadUsers() {
  if (loading.value || disposed) return

  loading.value = true
  loadError.value = ''

  // Retirar el contenido anterior mientras se comprueba el acceso.
  discardUsers()

  try {
    if (!(await checkAccess())) return

    const response = await listUsers(getFilters())

    if (disposed) return

    users.value = response.data
    total.value = response.meta?.total ?? response.data.length

    if (page.value > totalPages.value) {
      page.value = totalPages.value

      const adjusted = await listUsers(getFilters())

      if (disposed) return

      users.value = adjusted.data
      total.value = adjusted.meta?.total ?? adjusted.data.length
    }
  } catch (cause) {
    if (disposed) return

    discardUsers()

    try {
      if (await handleAccessError(cause)) return
    } catch {
      // Mostrar el error sin restaurar información protegida.
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
  if (busy.value || !canChangeStatus.value) return

  changingStatus.value = true
  changingUserId.value = user.id
  actionError.value = ''
  success.value = ''

  try {
    // Revalidar permisos antes de modificar la cuenta.
    if (!(await checkAccess())) return

    if (!hasPermission('users:deactivate')) {
      actionError.value =
        'Ya no tienes permiso para cambiar el estado de las cuentas.'
      return
    }

    const nextActive = !user.active
    const action = nextActive ? 'activar' : 'desactivar'

    const confirmed = window.confirm(
      `¿Deseas ${action} la cuenta de ${user.name} (${user.email})?`,
    )

    if (!confirmed) return

    await setUserStatus(user.id, nextActive)

    success.value = `La cuenta de ${user.name} se ${
      nextActive ? 'activó' : 'desactivó'
    } correctamente.`

    await loadUsers()
  } catch (cause) {
    try {
      if (await handleAccessError(cause)) return
    } catch {
      discardUsers()
    }

    actionError.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo cambiar el estado.'
  } finally {
    changingStatus.value = false
    changingUserId.value = null
  }
}

async function logout() {
  if (busy.value) return

  discardUsers()
  clearSession()
  await router.replace('/login')
}

function revalidateWhenVisible() {
  if (
    !disposed &&
    !busy.value &&
    document.visibilityState === 'visible'
  ) {
    void loadUsers()
  }
}

onMounted(() => {
  void loadUsers()

  window.addEventListener('focus', revalidateWhenVisible)

  // Detectar cambios de permisos mientras la pantalla está abierta.
  refreshTimer = setInterval(revalidateWhenVisible, 30000)
})

onUnmounted(() => {
  disposed = true
  discardUsers()

  window.removeEventListener('focus', revalidateWhenVisible)

  if (refreshTimer !== undefined) {
    clearInterval(refreshTimer)
  }
})
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
          v-if="canCreate && !busy"
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
      <form
        v-if="canRead"
        class="filters"
        @submit.prevent="applyFilters"
      >
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
          <select id="active" v-model="active" :disabled="busy">
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
        Comprobando acceso y cargando usuarios…
      </p>

      <div v-else-if="loadError" class="error" role="alert">
        <p>{{ loadError }}</p>
        <button
          class="secondary"
          :disabled="busy"
          @click="loadUsers"
        >
          Reintentar
        </button>
      </div>

      <template v-else-if="canRead">
        <p v-if="users.length === 0">
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
                <th v-if="hasActions" scope="col">Acciones</th>
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

                <td v-if="hasActions">
                  <div class="row-actions">
                    <RouterLink
                      v-if="canEdit && !busy"
                      class="edit-link"
                      :to="`/users/${user.id}/edit`"
                      :aria-label="`Editar a ${user.name}`"
                    >
                      Editar
                    </RouterLink>

                    <button
                      v-if="canChangeStatus"
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

        <footer class="pagination">
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
      </template>
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

.edit-link,
button.secondary {
  border: 1px solid #2457d6;
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
a:focus-visible {
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

.active,
.success {
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