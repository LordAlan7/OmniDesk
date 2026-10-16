import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import router from '../index'
import { useSessionStore } from '@/stores/session'

const employee = { id: 1, name: 'Demo', email: 'e@x.com', roles: ['Employee'], permissions: ['tickets:read:own'] }
const admin = { id: 5, name: 'Admin', email: 'a@x.com', roles: ['Administrator'], permissions: ['users:read:list'] }

beforeEach(async () => {
  setActivePinia(createPinia())
  sessionStorage.clear()
  await router.replace('/login').catch(() => {})
})

function loginAs(user: typeof employee) {
  const s = useSessionStore()
  s.user = user
  s.restored = true
}

describe('router guards', () => {
  it('sin sesión: ruta protegida redirige a login conservando el destino', async () => {
    useSessionStore().restored = true
    await router.push('/tickets')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/tickets')
  })

  it('empleado en ruta de administración -> acceso denegado', async () => {
    loginAs(employee)
    await router.push('/users')
    expect(router.currentRoute.value.name).toBe('forbidden')
  })

  it('empleado en su ruta permitida -> entra', async () => {
    loginAs(employee)
    await router.push('/tickets')
    expect(router.currentRoute.value.name).toBe('tickets')
  })

  it('administrador sin permisos de tickets no entra a /tickets', async () => {
    loginAs(admin)
    await router.push('/tickets')
    expect(router.currentRoute.value.name).toBe('forbidden')
  })

  it('con sesión, /login redirige al inicio', async () => {
    loginAs(employee)
    await router.push('/forbidden') // salir de /login para que la navegación no sea duplicada
    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('dashboard')
  })
})
