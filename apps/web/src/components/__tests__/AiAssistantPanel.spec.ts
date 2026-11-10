import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AiAssistantPanel from '../AiAssistantPanel.vue'
import { ApiError } from '@/api/http'
import type { AssistantResult } from '@/services/aiAssistant'

// Se usa un stub propio (y no vi.fn) para que una promesa rechazada no se registre como "no manejada".
let implementation: (...args: unknown[]) => Promise<AssistantResult> = async () => {
  throw new Error('askAssistant no configurado')
}
let calls: unknown[][] = []

vi.mock('@/services/aiAssistant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/aiAssistant')>()),
  askAssistant: (...args: unknown[]) => {
    calls.push(args)
    return implementation(...args)
  },
}))

const respondWith = (value: AssistantResult) => {
  implementation = async () => value
}
const failWith = (error: Error) => {
  implementation = async () => {
    throw error
  }
}

const result = (extra: Partial<AssistantResult> = {}): AssistantResult => ({
  interactionId: 1,
  condition: 'recommendation',
  aiGenerated: true,
  requiresHumanReview: true,
  message: null,
  recommendation: 'Reinicia la impresora.',
  steps: ['Apaga la impresora', 'Enciéndela'],
  additionalInformation: [],
  references: [
    { authorizationId: 3, sourceType: 'article', sourceId: 9, sourceVersion: '2', title: 'Impresora de caja', chunkIndex: 0 },
  ],
  ticketId: null,
  ...extra,
})

const ask = async (wrapper: ReturnType<typeof mount>, text = 'La impresora no imprime') => {
  await wrapper.find('textarea').setValue(text)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('AiAssistantPanel (FR-013)', () => {
  beforeEach(() => {
    calls = []
  })

  it('does not submit an empty question', async () => {
    const wrapper = mount(AiAssistantPanel)
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    await ask(wrapper, '   ')
    expect(calls).toHaveLength(0)
  })

  it('shows the AI label, the recommendation and the sources with their version', async () => {
    respondWith(result())
    const wrapper = mount(AiAssistantPanel)
    await ask(wrapper)

    expect(wrapper.find('[data-testid=ai-label]').text()).toMatch(/Generado por IA/)
    expect(wrapper.find('[data-testid=ai-label]').text()).toMatch(/revisión humana/)
    expect(wrapper.text()).toContain('Reinicia la impresora.')
    expect(wrapper.findAll('[data-testid=ai-steps] li')).toHaveLength(2)
    expect(wrapper.find('[data-testid=ai-references]').text()).toMatch(/versión 2/)
    // no se sugiere aplicación automática
    expect(wrapper.findAll('button').map((b) => b.text().toLowerCase()).join(' ')).not.toMatch(/aplicar|guardar|resolver/)
  })

  it('blocks repeated submissions while a query is in progress', async () => {
    let finish: (value: AssistantResult) => void = () => {}
    implementation = () => new Promise<AssistantResult>((resolve) => (finish = resolve))
    const wrapper = mount(AiAssistantPanel)

    await wrapper.find('textarea').setValue('La impresora no imprime')
    await wrapper.find('form').trigger('submit')
    await wrapper.find('form').trigger('submit')

    expect(calls).toHaveLength(1)
    expect(wrapper.find('[data-testid=ai-loading]').exists()).toBe(true)
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()

    finish(result())
    await flushPromises()
    expect(wrapper.find('[data-testid=ai-loading]').exists()).toBe(false)
  })

  it('keeps the question and does not show a recommendation when the service fails', async () => {
    failWith(new ApiError(503, 'AI_UNAVAILABLE', 'El asistente no está disponible.', 'server'))
    const wrapper = mount(AiAssistantPanel)
    await ask(wrapper, 'Mi router no conecta')

    expect(wrapper.find('[data-testid=ai-error]').text()).toBe('El asistente no está disponible.')
    expect(wrapper.find('[data-testid=ai-result]').exists()).toBe(false)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Mi router no conecta')
  })

  it('explains insufficient support and requests more information visibly', async () => {
    respondWith(
      result({ condition: 'insufficient_support', recommendation: null, steps: [], references: [], message: 'No hay información autorizada suficiente.' }),
    )
    const wrapper = mount(AiAssistantPanel)
    await ask(wrapper)
    expect(wrapper.find('[data-testid=ai-insufficient]').text()).toMatch(/No hay información autorizada suficiente/)
    expect(wrapper.find('[data-testid=ai-references]').exists()).toBe(false)

    respondWith(
      result({ condition: 'needs_more_info', recommendation: null, steps: [], references: [], message: 'Necesito más datos.', additionalInformation: ['¿Qué modelo es?'] }),
    )
    await ask(wrapper, 'Falla algo en el equipo')
    expect(wrapper.find('[data-testid=ai-more-info]').text()).toContain('¿Qué modelo es?')
  })

  it('tells which ticket is used as context and sends only the id', async () => {
    respondWith(result({ ticketId: 12 }))
    const wrapper = mount(AiAssistantPanel, { props: { ticketId: 12, ticketTitle: 'Router caído' } })

    expect(wrapper.find('[data-testid=ai-ticket-context]').text()).toMatch(/ticket #12/)
    await ask(wrapper)
    expect(calls).toEqual([['La impresora no imprime', 12]])
  })
})
