import { createRouter, createWebHistory } from 'vue-router'
import TicketsView from '../views/TicketsView.vue'
import TicketDetailView from '../views/TicketDetailView.vue'
import DocumentsView from '../views/DocumentsView.vue'
import LoginView from '../views/LoginView.vue'
import UsersView from '../views/UsersView.vue'
import CreateUserView from '../views/CreateUserView.vue'
import EditUserView from '../views/EditUserView.vue'
import AccessDeniedView from '../views/AccessDeniedView.vue'
import {
  hasEveryPermission,
  refreshSession,
} from '../services/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/users',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/access-denied',
      name: 'access-denied',
      component: AccessDeniedView,
    },
    {
      path: '/tickets',
      name: 'tickets',
      component: TicketsView,
      meta: {
        requiresAuth: true,
        permissions: ['tickets:read'],
      },
    },
    {
      path: '/tickets/:id',
      name: 'ticket-detail',
      component: TicketDetailView,
      meta: {
        requiresAuth: true,
        permissions: ['tickets:read'],
      },
    },
    {
      path: '/knowledge/documents',
      name: 'documents',
      component: DocumentsView,
      meta: {
        requiresAuth: true,
        permissions: ['knowledge:read'],
      },
    },
    {
      path: '/users',
      name: 'users',
      component: UsersView,
      meta: {
        requiresAuth: true,
        permissions: ['users:read:list'],
      },
    },
    {
      path: '/users/new',
      name: 'create-user',
      component: CreateUserView,
      meta: {
        requiresAuth: true,
        permissions: [
          'users:create',
          'users:assign:roles',
        ],
      },
    },
    {
      path: '/users/:id/edit',
      name: 'edit-user',
      component: EditUserView,
      meta: {
        requiresAuth: true,
        permissions: [
          'users:read',
          'users:update',
          'users:assign:roles',
        ],
      },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/users',
    },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  try {
    const user = await refreshSession()

    if (!user) return { name: 'login' }

    const permissions = (
      to.meta.permissions ?? []
    ) as string[]

    if (!hasEveryPermission(...permissions)) {
      return { name: 'access-denied' }
    }

    return true
  } catch {
    return {
      name: 'access-denied',
      query: { reason: 'unavailable' },
    }
  }
})

export default router