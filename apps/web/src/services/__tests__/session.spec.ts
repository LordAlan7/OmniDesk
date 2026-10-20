import { beforeEach, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { sessionUser, hasPermission } from '../session'
import { useSessionStore } from '@/stores/session'

beforeEach(() => { setActivePinia(createPinia()); sessionStorage.clear() })
it('las vistas de tickets reflejan la sesión Pinia y su cierre', () => {
  const session = useSessionStore()
  session.user = { id: 3, name: 'Asesor', email: 'advisor@company.com', roles: ['Service Advisor'], permissions: ['tickets:assign'] }
  expect(sessionUser.value?.id).toBe(3)
  expect(hasPermission('tickets:assign')).toBe(true)
  session.clear()
  expect(sessionUser.value).toBeNull()
  expect(hasPermission('tickets:assign')).toBe(false)
})
