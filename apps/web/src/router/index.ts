import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** Ruta accesible sin sesión (login). */
    public?: boolean
    /** Permisos de la ruta. Por defecto basta con UNO. */
    permissions?: string[]
    /** true: se exigen TODOS los permisos de la lista. */
    requireAll?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
    {
      path: '/tickets',
      name: 'tickets',
      component: () => import('@/views/TicketsView.vue'),
      meta: { permissions: ['tickets:read:own', 'tickets:read:all'] },
    },
    {
      path: '/users',
      name: 'users',
      component: () => import('@/views/UsersView.vue'),
      meta: { permissions: ['users:read:list'] },
    },
    {
      path: '/users/new',
      name: 'create-user',
      component: () => import('@/views/CreateUserView.vue'),
      meta: { permissions: ['users:create', 'users:assign:roles'], requireAll: true },
    },
    {
      path: '/users/:id/edit',
      name: 'edit-user',
      component: () => import('@/views/EditUserView.vue'),
      meta: { permissions: ['users:read', 'users:update', 'users:assign:roles'], requireAll: true },
    },
    { path: '/access-denied', name: 'access-denied', component: () => import('@/views/AccessDeniedView.vue'), meta: { public: true } },
    { path: '/forbidden', name: 'forbidden', component: () => import('@/views/ForbiddenView.vue') },
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.restore() // recarga: recupera la sesión si sigue vigente

  if (to.meta.public) {
    return session.isAuthenticated && to.name === 'login' ? { name: 'dashboard' } : true
  }
  if (!session.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  const required = to.meta.permissions
  if (required) {
    const allowed = to.meta.requireAll
      ? required.every((p) => session.can(p))
      : session.can(...required)
    if (!allowed) return { name: 'forbidden' } // sin revelar el contenido protegido
  }
  return true
})

export default router
