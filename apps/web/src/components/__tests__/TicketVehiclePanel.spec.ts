import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TicketVehiclePanel from '../TicketVehiclePanel.vue'
import { ApiError } from '@/api/http'

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }))

vi.mock('../../services/session', () => ({
  hasPermission: (permission: string) => permissions.granted.has(permission),
  hasEveryPermission: (...list: string[]) => list.every((p) => permissions.granted.has(p)),
  clearSession: vi.fn(),
  refreshSession: vi.fn(),
}))

vi.mock('../../services/inventory', () => ({
  INVENTORY_READ: 'inventory:read',
  getVehicleWarranty: vi.fn(),
  getCompatibleProducts: vi.fn(),
}))

import { getCompatibleProducts, getVehicleWarranty } from '../../services/inventory'

const mocked = {
  warranty: vi.mocked(getVehicleWarranty),
  compatibles: vi.mocked(getCompatibleProducts),
}

const ticket = {
  vehicleVin: 'MD2A1AAX5RWA00004',
  vehicleBrand: 'Marca Demo',
  vehicleModel: 'Modelo 150',
  vehicleYear: 2023,
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

const warranty = {
  status: 'ACTIVE' as const,
  startDate: '2025-01-10T00:00:00.000Z',
  expiresAt: '2027-01-10T00:00:00.000Z',
  daysRemaining: 47,
  coverage: 'Motor y transmisión',
  voidedReason: null,
  openClaims: 1,
}

function product(sku: string, name: string, stockLevel: 'AVAILABLE' | 'LOW' | 'OUT') {
  return {
    id: `id-${sku}`,
    sku,
    name,
    brand: 'Marca Demo',
    category: { id: 'c1', name: 'Filtros' },
    status: 'ACTIVE',
    codes: [],
    stockTotal: stockLevel === 'OUT' ? 0 : 8,
    stockLevel,
  }
}

const unavailable = new ApiError(
  503,
  'INVENTORY_UNAVAILABLE',
  'El servicio de inventario no está disponible.',
  'server',
)

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(TicketVehiclePanel, { props: { ticket, vehicle, ...props } })
}

beforeEach(() => {
  vi.clearAllMocks()
  permissions.granted.clear()
  permissions.granted.add('inventory:read')
})

describe('TicketVehiclePanel', () => {
  it('no renderiza nada sin el permiso inventory:read', () => {
    permissions.granted.clear()
    const wrapper = mountPanel()

    expect(wrapper.find('[data-testid="ticket-vehicle-panel"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Motocicleta')
    expect(mocked.warranty).not.toHaveBeenCalled()
    expect(mocked.compatibles).not.toHaveBeenCalled()
  })

  it('sin VIN avisa que no hay moto vinculada y no consulta inventario', () => {
    const wrapper = mountPanel({
      ticket: { vehicleVin: null, vehicleBrand: null, vehicleModel: null, vehicleYear: null },
      vehicle: null,
    })

    expect(wrapper.text()).toContain('no tiene una motocicleta vinculada')
    expect(wrapper.find('[data-testid="vehicle-load-warranty"]').exists()).toBe(false)
    expect(mocked.warranty).not.toHaveBeenCalled()
  })

  it('muestra la copia guardada en el ticket y el estado en inventario', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('[data-testid="vehicle-linked-vin"]').text()).toBe('MD2A1AAX5RWA00004')
    expect(wrapper.text()).toContain('Marca Demo')
    expect(wrapper.text()).toContain('Modelo 150')
    expect(wrapper.text()).toContain('2023')
    expect(wrapper.text()).toContain('Vendida')
  })

  it('carga garantía y refacciones solo bajo demanda', async () => {
    mocked.warranty.mockResolvedValue(warranty)
    mocked.compatibles.mockResolvedValue([product('FIL-ACE-150', 'Filtro de aceite', 'AVAILABLE')])
    const wrapper = mountPanel()
    await flushPromises()

    expect(mocked.warranty).not.toHaveBeenCalled()
    expect(mocked.compatibles).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="vehicle-load-warranty"]').trigger('click')
    await flushPromises()

    expect(mocked.warranty).toHaveBeenCalledWith(vehicle.id)
    expect(wrapper.find('[data-testid="vehicle-warranty"]').text()).toContain('Vigente')
    expect(wrapper.find('[data-testid="vehicle-warranty"]').text()).toContain('Motor y transmisión')
    expect(mocked.compatibles).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="vehicle-load-products"]').trigger('click')
    await flushPromises()

    expect(mocked.compatibles).toHaveBeenCalledWith(vehicle.id)
    const list = wrapper.find('[data-testid="vehicle-products"]')
    expect(list.text()).toContain('FIL-ACE-150')
    expect(list.text()).toContain('Disponible')
  })

  it('indica bajo y agotado en las refacciones y no muestra precios', async () => {
    mocked.compatibles.mockResolvedValue([
      product('BUJ-01', 'Bujía', 'LOW'),
      product('CAD-02', 'Cadena', 'OUT'),
    ])
    const wrapper = mountPanel()

    await wrapper.find('[data-testid="vehicle-load-products"]').trigger('click')
    await flushPromises()

    const text = wrapper.find('[data-testid="vehicle-products"]').text()
    expect(text).toContain('Bajo')
    expect(text).toContain('Agotado')
    expect(wrapper.text().toLowerCase()).not.toContain('precio')
  })

  it('muestra estado vacío cuando no hay refacciones compatibles', async () => {
    mocked.compatibles.mockResolvedValue([])
    const wrapper = mountPanel()

    await wrapper.find('[data-testid="vehicle-load-products"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('No hay refacciones compatibles registradas')
  })

  it('si el inventario no responde muestra un error sin romper el panel', async () => {
    mocked.warranty.mockRejectedValue(unavailable)
    const wrapper = mountPanel()

    await wrapper.find('[data-testid="vehicle-load-warranty"]').trigger('click')
    await flushPromises()

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('no está disponible')
    expect(wrapper.find('[data-testid="vehicle-linked-vin"]').exists()).toBe(true)
  })

  it('con la moto sin resolver deshabilita las consultas y conserva los datos del ticket', () => {
    const wrapper = mountPanel({ vehicle: null })

    expect(wrapper.find('[data-testid="vehicle-unresolved"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="vehicle-load-warranty"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.find('[data-testid="vehicle-load-products"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.text()).toContain('Modelo 150')
  })

  it('la acción rápida solo aparece con canAskAi y emite ask-ai', async () => {
    const without = mountPanel()
    expect(without.find('[data-testid="vehicle-ask-ai"]').exists()).toBe(false)

    const wrapper = mountPanel({ canAskAi: true })
    await wrapper.find('[data-testid="vehicle-ask-ai"]').trigger('click')

    expect(wrapper.emitted('ask-ai')).toHaveLength(1)
  })
})