import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../App.vue'
import router from '../router'

describe('App', () => {
  it('monta sin sesión y no muestra la barra de navegación', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/login')
    await router.isReady()
    expect(wrapper.find('header.topbar').exists()).toBe(false)
  })
})
