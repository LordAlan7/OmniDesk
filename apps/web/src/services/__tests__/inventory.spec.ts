import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCompatibleProducts,
  getProduct,
  getProductByCode,
  getProductStock,
  getVehicle,
  getVehicleByVin,
  getVehicleEvents,
  getVehicleModel,
  getWarranty,
  listProducts,
  listVehicleModels,
} from '../inventory'

/** Mismo patrón que api/__tests__/http.spec.ts: se stubbea el fetch global. */
const respond = (status: number, body?: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    ),
  )

const lastUrl = () => vi.mocked(fetch).mock.calls[0]![0] as string

afterEach(() => vi.unstubAllGlobals())

const vehicle = {
  id: 'v-1',
  vin: 'MD2A1AAX5RWA00004',
  brand: 'Marca Demo',
  model: 'Modelo 150',
  modelId: 'm-1',
  year: 2023,
  status: 'SOLD',
  locationId: 'loc-1',
  modelStock: 0,
}

const event = { id: 'e-1', type: 'SALE', occurredAt: '2026-11-01T10:00:00.000Z', locationId: 'loc-1' }

const warranty = {
  status: 'ACTIVE',
  startDate: '2026-01-01',
  expiresAt: '2027-01-01',
  daysRemaining: 40,
  coverage: 'Motor y transmisión',
  voidedReason: null,
  openClaims: 0,
}

const product = {
  id: 'p-1',
  sku: 'SKU-1',
  name: 'Filtro de aceite',
  brand: 'Marca Demo',
  category: { id: 'c-1', name: 'Filtros' },
  status: 'ACTIVE',
  codes: [{ value: 'REF 12' }],
}

const compatible = { ...product, stockTotal: 12, stockLevel: 'AVAILABLE' as const }

const stock = {
  productId: 'p-1',
  total: 12,
  locations: [
    { location: { id: 'loc-1', name: 'Almacén Central', type: 'WAREHOUSE' }, quantity: 12, level: 'AVAILABLE' },
  ],
}

const model = { id: 'm-1', brand: 'Marca Demo', model: 'Modelo 150', yearFrom: 2020, yearTo: 2023, engineCc: 150, status: 'ACTIVE' }

describe('services/inventory — capa de solo lectura (paso 9)', () => {
  it('getVehicleByVin normaliza el VIN y consulta la ruta del contrato', async () => {
    respond(200, { data: vehicle })
    await expect(getVehicleByVin(' md2a1aax5rwa00004 ')).resolves.toEqual(vehicle)
    expect(lastUrl()).toContain('/inventory/vehicles/by-vin/MD2A1AAX5RWA00004')
  })

  it('getVehicle consulta por id', async () => {
    respond(200, { data: vehicle })
    await expect(getVehicle('v-1')).resolves.toEqual(vehicle)
    expect(lastUrl()).toContain('/inventory/vehicles/v-1')
  })

  it('getVehicleEvents devuelve la lista de eventos', async () => {
    respond(200, { data: [event] })
    await expect(getVehicleEvents('v-1')).resolves.toEqual([event])
    expect(lastUrl()).toContain('/inventory/vehicles/v-1/events')
  })

  it('getWarranty devuelve la garantía expuesta', async () => {
    respond(200, { data: warranty })
    await expect(getWarranty('v-1')).resolves.toEqual(warranty)
    expect(lastUrl()).toContain('/inventory/vehicles/v-1/warranty')
  })

  it('getCompatibleProducts devuelve refacciones con existencias', async () => {
    respond(200, { data: [compatible] })
    await expect(getCompatibleProducts('v-1')).resolves.toEqual([compatible])
    expect(lastUrl()).toContain('/inventory/vehicles/v-1/compatible-products')
  })

  it('listProducts envía solo los filtros definidos y devuelve data + meta', async () => {
    respond(200, { data: [product], meta: { page: 2, limit: 10, total: 12 } })
    const page = await listProducts({ search: 'aceite', page: 2, limit: 10 })
    expect(page.data).toEqual([product])
    expect(page.meta).toEqual({ page: 2, limit: 10, total: 12 })
    expect(lastUrl()).toContain('search=aceite')
    expect(lastUrl()).toContain('page=2')
    expect(lastUrl()).toContain('limit=10')
    expect(lastUrl()).not.toContain('categoryId=')
  })

  it('listProducts sin filtros no añade query string; lista vacía llega como []', async () => {
    respond(200, { data: [], meta: { page: 1, limit: 20, total: 0 } })
    const page = await listProducts()
    expect(page.data).toEqual([])
    expect(lastUrl()).toContain('/inventory/products')
    expect(lastUrl()).not.toContain('?')
  })

  it('getProductByCode codifica el valor en la URL', async () => {
    respond(200, { data: product })
    await expect(getProductByCode('REF 12')).resolves.toEqual(product)
    expect(lastUrl()).toContain('/inventory/products/by-code/REF%2012')
  })

  it('getProduct consulta por id', async () => {
    respond(200, { data: product })
    await expect(getProduct('p-1')).resolves.toEqual(product)
    expect(lastUrl()).toContain('/inventory/products/p-1')
  })

  it('getProductStock devuelve existencias por ubicación', async () => {
    respond(200, { data: stock })
    await expect(getProductStock('p-1')).resolves.toEqual(stock)
    expect(lastUrl()).toContain('/inventory/products/p-1/stock')
  })

  it('listVehicleModels devuelve la lista (puede venir vacía)', async () => {
    respond(200, { data: [] })
    await expect(listVehicleModels()).resolves.toEqual([])
    expect(lastUrl()).toContain('/inventory/vehicle-models')
  })

  it('getVehicleModel consulta por id', async () => {
    respond(200, { data: model })
    await expect(getVehicleModel('m-1')).resolves.toEqual(model)
    expect(lastUrl()).toContain('/inventory/vehicle-models/m-1')
  })

  describe('estados de error con el ApiError ya clasificado', () => {
    it('503 del inventario se clasifica como server', async () => {
      respond(503, {
        error: { code: 'INVENTORY_UNAVAILABLE', message: 'El servicio de inventario no está disponible.' },
      })
      await expect(listVehicleModels()).rejects.toMatchObject({
        status: 503,
        code: 'INVENTORY_UNAVAILABLE',
        kind: 'server',
      })
    })

    it('404 se clasifica como client', async () => {
      respond(404, { error: { code: 'INVENTORY_NOT_FOUND', message: 'El recurso no existe en inventario.' } })
      await expect(getVehicle('v-1')).rejects.toMatchObject({ status: 404, kind: 'client' })
    })

    it('la caída de red se clasifica como network', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
      await expect(listVehicleModels()).rejects.toMatchObject({ status: 0, kind: 'network' })
    })
  })
})