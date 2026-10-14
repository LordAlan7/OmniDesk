import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** Ruta accesible sin sesión (login). */
    public?: boolean
    /** Basta con tener UNO de estos permisos para entrar. */
    permissions?: string[]
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
      path: '/admin/users',
      name: 'admin-users',
      component: () => import('@/views/AdminUsersView.vue'),
      meta: { permissions: ['users:manage'] },
    },
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
  if (to.meta.permissions && !session.can(...to.meta.permissions)) {
    return { name: 'forbidden' } // sin revelar el contenido protegido
  }
  return true
})

export default router
