import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AssistantPanel from '../AssistantPanel.vue'

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }))

vi.mock('../../services/session', () => ({
  hasPermission: (permission: string) => permissions.granted.has(permission),
}))

vi.mock('../../services/inventory', () => ({
  INVENTORY_READ: 'inventory:read',
}))

vi.mock('../../services/aiAssistant', () => ({
  askAssistant: vi.fn(),
  reviewInteraction: vi.fn(),
  applyInteraction: vi.fn(),
}))

import { askAssistant } from '../../services/aiAssistant'

const mockedAsk = vi.mocked(askAssistant)

const answer = {
  id: 1,
  status: 'answered' as const,
  answer: 'Revisa el módulo de encendido y el fusible principal.',
  references: [
    {
      authorizationId: 1,
      sourceType: 'article' as const,
      sourceId: 5,
      sourceVersion: '2',
      title: 'Cómo reiniciar el módulo de encendido',
      chunkIndex: 0,
    },
  ],
  aiGenerated: true as const,
  transparency: {
    status: 'supported' as const,
    title: 'Recomendación generada por IA',
    message: 'Esta recomendación utiliza referencias verificadas.',
    requiresHumanReview: true,
    missingInformation: [],
  },
  inventory: {
    status: 'used' as const,
    source: 'inventory' as const,
    vin: 'MD2A1AAX5RWA00004',
    vehicle: 'Marca Demo Modelo 150 2023',
    fetchedAt: '2026-11-24T15:30:00.000Z',
    warrantyStatus: 'ACTIVE',
    compatibleProducts: 4,
  },
  createdAt: '2026-11-24T15:30:00.000Z',
}

async function askFromForm(wrapper: ReturnType<typeof mount>, text: string) {
  await wrapper.find('#assistant-question').setValue(text)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  permissions.granted.clear()
  mockedAsk.mockResolvedValue(answer)
})

describe('AssistantPanel: inventario', () => {
  it('con inventory:read muestra la fuente Inventario junto a las referencias', async () => {
    permissions.granted.add('inventory:read')
    const wrapper = mount(AssistantPanel, { props: { ticketId: 7 } })

    await askFromForm(wrapper, '¿Por qué no enciende la moto?')

    expect(wrapper.find('[data-testid="ai-inventory-source"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Cómo reiniciar el módulo de encendido')
  })

  it('sin inventory:read no muestra la fuente aunque el backend la envíe', async () => {
    const wrapper = mount(AssistantPanel, { props: { ticketId: 7 } })

    await askFromForm(wrapper, '¿Por qué no enciende la moto?')

    expect(wrapper.text()).toContain('Revisa el módulo de encendido')
    expect(wrapper.find('[data-testid="ai-inventory-source"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Fuente: Inventario')
  })

  it('askAboutVehicle envía la pregunta de la moto con el ticketId', async () => {
    permissions.granted.add('inventory:read')
    const wrapper = mount(AssistantPanel, { props: { ticketId: 7 } })

    await (wrapper.vm as unknown as { askAboutVehicle: () => Promise<void> }).askAboutVehicle()
    await flushPromises()

    expect(mockedAsk).toHaveBeenCalledTimes(1)
    expect(mockedAsk).toHaveBeenCalledWith(expect.stringContaining('motocicleta'), 7)
  })

  it('askAboutVehicle no hace nada si no hay ticket asociado', async () => {
    const wrapper = mount(AssistantPanel)

    await (wrapper.vm as unknown as { askAboutVehicle: () => Promise<void> }).askAboutVehicle()
    await flushPromises()

    expect(mockedAsk).not.toHaveBeenCalled()
  })
})