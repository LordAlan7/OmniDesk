import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, apiPage, ApiError, setAccessToken, setUnauthorizedHandler } from '../http'

const respond = (status: number, body?: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    ),
  )

afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
  setUnauthorizedHandler(null)
})

describe('cliente HTTP único', () => {
  it('envía el token Bearer y devuelve data', async () => {
    respond(200, { data: { id: 1 } })
    setAccessToken('abc')
    await expect(api('/x')).resolves.toEqual({ id: 1 })
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc')
  })

  it('apiPage devuelve data y meta de paginación', async () => {
    respond(200, { data: [1], meta: { page: 1, limit: 10, total: 1 } })
    await expect(apiPage('/x')).resolves.toEqual({
      data: [1],
      meta: { page: 1, limit: 10, total: 1 },
    })
  })

  it('un 401 protegido invoca el manejador global y lanza ApiError', async () => {
    const onExpired = vi.fn()
    setUnauthorizedHandler(onExpired)
    respond(401, { error: { code: 'UNAUTHORIZED', message: 'no' } })
    await expect(api('/x')).rejects.toMatchObject({ status: 401, kind: 'client' })
    expect(onExpired).toHaveBeenCalledOnce()
  })

  it('un 401 con auth:false (login) no dispara el manejador', async () => {
    const onExpired = vi.fn()
    setUnauthorizedHandler(onExpired)
    respond(401, { error: { code: 'UNAUTHORIZED', message: 'no' } })
    await expect(api('/x', { auth: false })).rejects.toBeInstanceOf(ApiError)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('un fallo de red se clasifica como network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
    await expect(api('/x')).rejects.toMatchObject({ kind: 'network', status: 0 })
  })
})


it('conserva la clave de idempotencia en el transporte común', async () => {
  respond(201, { data: { id: 1 } })
  await api('/tickets', { method: 'POST', body: { title: 'Prueba' }, headers: { 'Idempotency-Key': 'same-request' } })
  const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit
  expect(new Headers(init.headers).get('Idempotency-Key')).toBe('same-request')
})
