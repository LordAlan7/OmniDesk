import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '../inventory'

const model = {
  id: 'm-1',
  brand: 'Marca Demo',
  model: 'Modelo 150',
  yearFrom: 2020,
  yearTo: 2023,
  engineCc: 150,
  status: 'ACTIVE',
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.unstubAllGlobals()
})

it('cachea el modelo seleccionado durante la sesión', () => {
  const store = useInventoryStore()
  expect(store.selectedModel).toBeNull()

  store.selectModel(model)
  expect(store.selectedModel).toEqual(model)
  expect(store.hasSelectedModel).toBe(true)

  store.clearSelectedModel()
  expect(store.selectedModel).toBeNull()
})

it('ensureModel consulta una vez por id y luego reutiliza la caché', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: model }), { status: 200 })),
  )
  const store = useInventoryStore()

  const first = await store.ensureModel('m-1')
  const second = await store.ensureModel('m-1')

  expect(second).toBe(first)
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
})