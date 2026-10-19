import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/http'
import { useSessionStore } from '../session'

const ok = (data: unknown, status = 200) =>
  Promise.resolve(new Response(status === 204 ? null : JSON.stringify({ data }), { status }))
const fail = (status: number, code = 'UNAUTHORIZED') =>
  Promise.resolve(new Response(JSON.stringify({ error: { code, message: 'x' } }), { status }))

const employee = { id: 1, name: 'Demo', email: 'e@x.com', roles: ['Employee'], permissions: ['tickets:create', 'tickets:read:own'] }

beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('session store', () => {
  it('login correcto guarda usuario y token; can() usa los permisos', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok({ accessToken: 't1', expiresAt: '', user: employee })))
    const s = useSessionStore()
    await s.login('e@x.com', 'pw')
    expect(s.isAuthenticated).toBe(true)
    expect(sessionStorage.getItem('omnidesk.token')).toBe('t1')
    expect(s.can('tickets:create')).toBe(true)
    expect(s.can('users:manage')).toBe(false)
    expect(s.can()).toBe(true)
  })

  it('login con credenciales malas (401) no crea sesión', async () => {
    vi.stubGlobal('fetch', vi.fn(() => fail(401)))
    const s = useSessionStore()
    await expect(s.login('e@x.com', 'bad')).rejects.toBeInstanceOf(ApiError)
    expect(s.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem('omnidesk.token')).toBeNull()
  })

  it('error de red se distingue de credenciales incorrectas', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fail'))))
    const s = useSessionStore()
    await expect(s.login('e@x.com', 'pw')).rejects.toMatchObject({ kind: 'network' })
  })

  it('restore con token vigente recupera la sesión; con 401 la descarta', async () => {
    sessionStorage.setItem('omnidesk.token', 't1')
    vi.stubGlobal('fetch', vi.fn(() => ok(employee)))
    const a = useSessionStore()
    await a.restore()
    expect(a.isAuthenticated).toBe(true)

    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(() => fail(401)))
    const b = useSessionStore()
    await b.restore()
    expect(b.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem('omnidesk.token')).toBeNull()
  })

  it('restore con el servidor caído NO concede acceso', async () => {
    sessionStorage.setItem('omnidesk.token', 't1')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('down'))))
    const s = useSessionStore()
    await s.restore()
    expect(s.isAuthenticated).toBe(false)
  })

  it('logout limpia el estado local aunque el servidor falle', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok({ accessToken: 't1', expiresAt: '', user: employee })))
    const s = useSessionStore()
    await s.login('e@x.com', 'pw')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('down'))))
    await s.logout()
    expect(s.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem('omnidesk.token')).toBeNull()
  })
})
