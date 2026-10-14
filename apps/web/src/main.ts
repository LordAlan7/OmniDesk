import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from '@/api/http'
import { useSessionStore } from '@/stores/session'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Sesión vencida/revocada en cualquier petición protegida: limpiar y pedir nuevo login.
setUnauthorizedHandler(() => {
  useSessionStore().clear()
  void router.push({ name: 'login', query: { reason: 'expired' } })
})

app.mount('#app')
