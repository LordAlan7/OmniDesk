import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PartsLookupPanel from '../PartsLookupPanel.vue'
import { ApiError } from '@/api/http'

// Mock del servicio: el panel nunca debe hacer fetch propio.
vi.mock('../../services/inventory', () => ({
  getVehicleByVin: vi.fn(),
  getCompatibleProducts: vi.fn(),
  listProducts: vi.fn(),
  listVehicleModels: vi.fn(),
  getProductStock: vi.fn(),
}))

import {
  getCompatibleProducts,
  getProductStock,
  getVehicleByVin,
  listProducts,
  listVehicleModels,
} from '../../services/inventory'

const mocked = {
  vehicle: vi.mocked(getVehicleByVin),
  compatibles: vi.mocked(getCompatibleProducts),
  products: vi.mocked(listProducts),
  models: vi.mocked(listVehicleModels),
  stock: vi.mocked(getProductStock),
}

const vehicle = {
  id: 'f3aa1bda-b3d4-4300-958a-3b5cffa2f1f1',
  vin: 'MD2A1AAX5RWA00004',
  brand: 'Marca Demo',
  model: 'Modelo 150',
  modelId: 'b8fe35fc-65fa-41ac-a987-4da05383b074',
  year: 2023,
  status: 'SOLD' as const,
  locationId: '11111111-1111-4111-8111-111111111111',
  modelStock: 1,
}

const product = {
  id: '7a046a5a-d160-4938-aa29-b06f84ab1dec',
  sku: 'FIL-ACE-150',
  name: 'Filtro de aceite',
  brand: 'Marca Demo',
  category: { id: '33333333-3333-4333-8333-333333333333', name: 'Filtros' },
  status: 'ACTIVE',
  codes: [{ value: '75123134' }],
}

const stock = {
  productId: product.id,
  total: 15,
  locations: [
    {
      quantity: 12,
      level: 'AVAILABLE' as const,
      location: { id: '11111111-1111-4111-8111-111111111111', name: 'Almacén Principal', type: 'ALMACEN' },
    },
    {
      quantity: 3,
      level: 'LOW' as const,
      location: { id: '22222222-2222-4222-8222-222222222222', name: 'Taller', type: 'TALLER' },
    },
  ],
}

const unavailable = new ApiError(
  503,
  'INVENTORY_UNAVAILABLE',
  'El servicio de inventario no está disponible.',
  'server',
)

const notFound = new ApiError(
  404,
  'INVENTORY_NOT_FOUND',
  'La motocicleta no existe en inventario.',
  'client',
)

async function mountPanel(props: InstanceType<typeof PartsLookupPanel>['$props'] = {}) {
  const wrapper = mount(PartsLookupPanel, { props })
  await flushPromises()
  return wrapper
}

describe('PartsLookupPanel (paso 11)', () => {
  it('carga el catálogo al montar sin moto y muestra las filas', async () => {
    mocked.products.mockResolvedValue({
      data: [product as never],
      meta: { total: 1, page: 1, limit: 10 },
    })
    mocked.models.mockResolvedValue([])

    const wrapper = await mountPanel()
    expect(mocked.products).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid=parts-table]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Filtro de aceite')
    expect(wrapper.text()).toContain('FIL-ACE-150')
  })

  it('muestra el estado vacío cuando no hay resultados', async () => {
    mocked.products.mockResolvedValue({ data: [], meta: { total: 0 } })
    mocked.models.mockResolvedValue([])

    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid=parts-empty]').exists()).toBe(true)
  })

  it('muestra el error clasificado cuando el inventario no responde (503)', async () => {
    mocked.products.mockRejectedValue(unavailable)
    mocked.models.mockResolvedValue([])

    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid=parts-error]').exists()).toBe(true)
    expect(wrapper.text()).toContain('El inventario no responde')
  })

  it('con moto inyectada lista compatibles y no llama al catálogo', async () => {
    mocked.compatibles.mockResolvedValue([
      { ...product, stockTotal: 15, stockLevel: 'AVAILABLE' },
    ])
    mocked.models.mockResolvedValue([])

    const wrapper = await mountPanel({ vehicle })
    expect(mocked.compatibles).toHaveBeenCalledWith(vehicle.id)
    expect(mocked.products).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid=parts-vehicle-context]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Disponible')
  })

  it('resuelve un VIN, muestra el error claro si no existe y limpia al volver al catálogo', async () => {
    mocked.products.mockResolvedValue({ data: [], meta: { total: 0 } })
    mocked.models.mockResolvedValue([])
    mocked.vehicle.mockRejectedValue(notFound)

    const wrapper = await mountPanel()

    await wrapper.find('#parts-vin').setValue('md2a1aax5rwa00004')
    await wrapper.find('form.vin-bar button[type=submit]').trigger('submit')
    await flushPromises()

    expect(mocked.vehicle).toHaveBeenCalledWith('MD2A1AAX5RWA00004')
    expect(wrapper.find('[data-testid=parts-vin-error]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No existe una motocicleta con el VIN')
  })

  it('rechaza VIN inválido antes de consultar el servicio', async () => {
    mocked.products.mockResolvedValue({ data: [], meta: { total: 0 } })
    mocked.models.mockResolvedValue([])

    const wrapper = await mountPanel()

    await wrapper.find('#parts-vin').setValue('123')
    await wrapper.find('form.vin-bar button[type=submit]').trigger('submit')
    await flushPromises()

    expect(mocked.vehicle).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('17 caracteres')
  })

  it('expande existencias por ubicación con indicadores Disponible/Bajo', async () => {
    mocked.compatibles.mockResolvedValue([
      { ...product, stockTotal: 15, stockLevel: 'AVAILABLE' },
    ])
    mocked.models.mockResolvedValue([])
    mocked.stock.mockResolvedValue(stock)

    const wrapper = await mountPanel({ vehicle })

    // Botón "Ver" de la primera fila
    await wrapper.find('.btn-link').trigger('click')
    await flushPromises()

    expect(mocked.stock).toHaveBeenCalledWith(product.id)
    const locations = wrapper.find('[data-testid=stock-locations]')
    expect(locations.exists()).toBe(true)
    expect(locations.text()).toContain('Almacén Principal')
    expect(locations.text()).toContain('Taller')
    expect(locations.text()).toContain('Disponible')
    expect(locations.text()).toContain('Bajo')
  })

  it('copia el SKU y emite select con la refacción', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    mocked.compatibles.mockResolvedValue([
      { ...product, stockTotal: 15, stockLevel: 'AVAILABLE' },
    ])
    mocked.models.mockResolvedValue([])

    const wrapper = await mountPanel({ vehicle })

    await wrapper.find('[data-testid="copy-sku-FIL-ACE-150"]').trigger('click')

    expect(writeText).toHaveBeenCalledWith('FIL-ACE-150')
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ sku: 'FIL-ACE-150' })

    vi.unstubAllGlobals()
  })

  it('ordena por SKU al hacer clic en el encabezado (asc → desc)', async () => {
    mocked.compatibles.mockResolvedValue([
      { ...product, stockTotal: 0, stockLevel: 'OUT' },
      {
        ...product,
        id: '8b156b6b-e271-4a49-8b3a-c17f95bc2efd',
        sku: 'BAT-12V-9A',
        name: 'Batería 12V 9Ah',
        stockTotal: 0,
        stockLevel: 'OUT',
      },
    ])
    mocked.models.mockResolvedValue([])

    const wrapper = await mountPanel({ vehicle })

    let skus = wrapper.findAll('tbody td.mono').map((td) => td.text())
    expect(skus).toEqual(['BAT-12V-9A', 'FIL-ACE-150'])

    // Clic en "SKU" → invierte a descendente
    await wrapper.find('button.th-btn').trigger('click')
    skus = wrapper.findAll('tbody td.mono').map((td) => td.text())
    expect(skus).toEqual(['FIL-ACE-150', 'BAT-12V-9A'])
  })
})