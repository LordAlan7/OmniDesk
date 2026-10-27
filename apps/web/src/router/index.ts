
import {
  createRouter,
  createWebHistory,
} from 'vue-router'
import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    permissions?: string[]
    allPermissions?: string[]
    ticketWorkspace?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(
    import.meta.env.BASE_URL,
  ),

  routes: [
    {
      path: '/login',
      name: 'login',
      component: () =>
        import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () =>
        import('@/views/DashboardView.vue'),
    },
    {
      path: '/my-tickets',
      name: 'my-tickets',
      component: () =>
        import('@/views/MyTicketsView.vue'),
      meta: {
        permissions: ['tickets:read'],
      },
    },
    {
      path: '/my-tickets/:id',
      name: 'my-ticket-detail',
      component: () =>
        import('@/views/MyTicketsView.vue'),
      meta: {
        permissions: ['tickets:read'],
      },
    },
    {
      path: '/knowledge/documents',
      name: 'documents',
      component: () =>
        import('@/views/DocumentsView.vue'),
      meta: {
        permissions: ['knowledge:read'],
      },
    },
    {
      path: '/tickets/new',
      name: 'create-ticket',
      component: () =>
        import('@/views/CreateTicketView.vue'),
      meta: {
        permissions: ['tickets:create'],
      },
    },
    {
      path: '/tickets',
      name: 'tickets',
      component: () =>
        import('@/views/TicketsView.vue'),
      meta: {
        ticketWorkspace: true,
      },
    },
    {
      path: '/tickets/:id',
      name: 'ticket-detail',
      component: () =>
        import('@/views/TicketDetailView.vue'),
      meta: {
        ticketWorkspace: true,
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
      path: '/audit',
      name: 'audit',
      component: () => import('@/views/AuditView.vue'),
      meta: { permissions: ['audit:read'] },
    },
    {
      path: '/users',
      name: 'users',
      component: () =>
        import('@/views/UsersView.vue'),
      meta: {
        permissions: ['users:read:list'],
      },
    },
    {
      path: '/users/new',
      name: 'create-user',
      component: () =>
        import('@/views/CreateUserView.vue'),
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
      component: () =>
        import('@/views/EditUserView.vue'),
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
      component: () =>
        import('@/views/AccessDeniedView.vue'),
      meta: {
        public: true,
      },
    },
    {
      path: '/forbidden',
      name: 'forbidden',
      component: () =>
        import('@/views/ForbiddenView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: {
        name: 'dashboard',
      },
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()

  // Recuperar la sesión.
  await session.restore()

  // Rutas públicas.
  if (to.meta.public) {
    if (
      session.isAuthenticated &&
      to.name === 'login'
    ) {
      return { name: 'dashboard' }
    }

    return true
  }

  // Usuario sin sesión.
  if (!session.isAuthenticated) {
    return {
      name: 'login',
      query: {
        redirect: to.fullPath,
      },
    }
  }

  // Rutas que aceptan cualquiera de los
  // permisos declarados.
  if (
    to.meta.permissions &&
    !session.can(...to.meta.permissions)
  ) {
    return { name: 'forbidden' }
  }

  // Rutas que requieren todos los permisos.
  if (
    to.meta.allPermissions &&
    !to.meta.allPermissions.every(
      permission => session.can(permission),
    )
  ) {
    return { name: 'forbidden' }
  }

  // NFR-006: área operativa de tickets.
  //
  // Service Advisor y Manager pueden acceder
  // mediante tickets:read:all.
  //
  // Technician puede entrar para consultar
  // sus tickets y asignaciones.
  //
  // Employee y Administrator sin otro rol
  // operativo utilizan Mis tickets.
  if (to.meta.ticketWorkspace) {
    const hasGeneralAccess =
      session.can('tickets:read:all')

    const isTechnician =
      session.user?.roles.includes(
        'Technician',
      ) === true

    const hasTechnicianAccess =
      isTechnician &&
      session.can('tickets:read')

    if (
      !hasGeneralAccess &&
      !hasTechnicianAccess
    ) {
      return { name: 'forbidden' }
    }
  }

  return true
})

export default router
