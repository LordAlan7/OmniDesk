import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AIReferences from '../AIReferences.vue'
import AITransparency from '../AITransparency.vue'
import type { AITransparency as AITransparencyInfo, InventoryUsage } from '../../services/aiAssistant'

const reference = {
  authorizationId: 1,
  sourceType: 'article' as const,
  sourceId: 5,
  sourceVersion: '2',
  title: 'Cómo reiniciar el módulo de encendido',
  chunkIndex: 0,
}

const used: InventoryUsage = {
  status: 'used',
  source: 'inventory',
  vin: 'MD2A1AAX5RWA00004',
  vehicle: 'Marca Demo Modelo 150 2023',
  fetchedAt: '2026-11-24T15:30:00.000Z',
  warrantyStatus: 'ACTIVE',
  compatibleProducts: 4,
}

describe('AIReferences: fuente Inventario', () => {
  it('muestra la tarjeta con moto, VIN, garantía, refacciones y fecha de consulta', () => {
    const wrapper = mount(AIReferences, {
      props: { references: [reference], inventory: used },
    })

    const card = wrapper.find('[data-testid="ai-inventory-source"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('Fuente: Inventario')
    expect(card.text()).toContain('Marca Demo Modelo 150 2023')
    expect(card.text()).toContain('MD2A1AAX5RWA00004')
    expect(card.text()).toContain('Vigente')
    expect(card.text()).toContain('4')
    expect(card.text()).toContain('Consultado:')
    expect(card.text()).toContain('no es una cita')
  })

  it('mantiene las referencias de artículos junto a la tarjeta', () => {
    const wrapper = mount(AIReferences, {
      props: { references: [reference], inventory: used },
    })

    expect(wrapper.text()).toContain('Cómo reiniciar el módulo de encendido')
    expect(wrapper.text()).toContain('Artículo de conocimiento')
  })

  it('no muestra la tarjeta si el inventario no estuvo disponible', () => {
    const unavailable: InventoryUsage = {
      status: 'unavailable',
      source: 'inventory',
      fetchedAt: '2026-11-24T15:30:00.000Z',
    }
    const wrapper = mount(AIReferences, {
      props: { references: [reference], inventory: unavailable },
    })

    expect(wrapper.find('[data-testid="ai-inventory-source"]').exists()).toBe(false)
  })

  it.each([null, undefined])('no muestra la tarjeta cuando inventory es %s', (inventory) => {
    const wrapper = mount(AIReferences, {
      props: { references: [reference], inventory },
    })

    expect(wrapper.find('[data-testid="ai-inventory-source"]').exists()).toBe(false)
  })
})

describe('AITransparency: avisos', () => {
  const base: AITransparencyInfo = {
    status: 'supported',
    title: 'Recomendación generada por IA',
    message: 'Esta recomendación utiliza referencias verificadas.',
    requiresHumanReview: true,
    missingInformation: [],
  }

  it('muestra el aviso de inventario no disponible', () => {
    const wrapper = mount(AITransparency, {
      props: {
        transparency: {
          ...base,
          notices: [
            'No se pudo consultar el inventario; la respuesta se basa solo en la base de conocimiento.',
          ],
        },
        status: 'answered',
        referenceCount: 1,
      },
    })

    const notices = wrapper.find('[data-testid="ai-transparency-notices"]')
    expect(notices.exists()).toBe(true)
    expect(notices.text()).toContain('No se pudo consultar el inventario')
  })

  it('sin avisos no renderiza la lista', () => {
    const wrapper = mount(AITransparency, {
      props: { transparency: base, status: 'answered', referenceCount: 1 },
    })

    expect(wrapper.find('[data-testid="ai-transparency-notices"]').exists()).toBe(false)
  })
})