
import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** Ruta accesible sin sesión. */
    public?: boolean
    /** Basta con tener uno de estos permisos para entrar. */
    permissions?: string[]
    /** Se requieren todos los permisos indicados. */
    allPermissions?: string[]
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  routes: [
    {
      path: '/my-tickets', name: 'my-tickets',
      component: () => import('@/views/MyTicketsView.vue'),
      meta: { permissions: ['tickets:read'] },
    },
    {
      path: '/my-tickets/:id', name: 'my-ticket-detail',
      component: () => import('@/views/MyTicketsView.vue'),
      meta: { permissions: ['tickets:read'] },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/knowledge/documents',
      name: 'documents',
      component: () => import('@/views/DocumentsView.vue'),
      meta: {
        permissions: ['knowledge:read'],
      },
    },
    {
      path: '/tickets',
      name: 'tickets',
      component: () => import('@/views/TicketsView.vue'),
      meta: {
        permissions: ['tickets:read', 'tickets:read:own', 'tickets:read:all'],
      },
    },
    {
      path: '/tickets/:id',
      name: 'ticket-detail',
      component: () => import('@/views/TicketDetailView.vue'),
      meta: { permissions: ['tickets:read', 'tickets:read:own', 'tickets:read:all'] },
    },
    {
      path: '/tickets/new',
      name: 'create-ticket',
      component: () => import('@/views/CreateTicketView.vue'),
      meta: {
        permissions: ['tickets:create'],
      },
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      redirect: { name: 'users' },
      meta: {
        permissions: ['users:manage'],
      },
    },
    {
      path: '/users',
      name: 'users',
      component: () => import('@/views/UsersView.vue'),
      meta: {
        permissions: ['users:read:list'],
      },
    },
    {
      path: '/users/new',
      name: 'create-user',
      component: () => import('@/views/CreateUserView.vue'),
      meta: {
        allPermissions: [
          'users:create',
          'users:assign:roles',
        ],
      },
    },
    {
      path: '/users/:id/edit',
      name: 'edit-user',
      component: () => import('@/views/EditUserView.vue'),
      meta: {
        allPermissions: [
          'users:read',
          'users:update',
          'users:assign:roles',
        ],
      },
    },
    {
      path: '/access-denied',
      name: 'access-denied',
      component: () => import('@/views/AccessDeniedView.vue'),
      meta: { public: true },
    },
    {
      path: '/forbidden',
      name: 'forbidden',
      component: () => import('@/views/ForbiddenView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'dashboard' },
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()

  // Recupera la sesión si sigue vigente.
  await session.restore()

  if (to.meta.public) {
    if (session.isAuthenticated && to.name === 'login') {
      return { name: 'dashboard' }
    }

    return true
  }

  if (!session.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  // Basta con tener al menos uno de los permisos indicados.
  if (
    to.meta.permissions &&
    !session.can(...to.meta.permissions)
  ) {
    return { name: 'forbidden' }
  }

  // Para estas rutas se requieren todos los permisos indicados.
  if (
    to.meta.allPermissions &&
    !to.meta.allPermissions.every((permission) =>
      session.can(permission),
    )
  ) {
    return { name: 'forbidden' }
  }

  return true
})

export default router
