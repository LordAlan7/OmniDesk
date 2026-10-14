# apps/web (Frontend Vue.js)

Pendiente de crear. Desde la raíz del repo:

```bash
cd apps
npm create vue@latest web     # TypeScript, Vue Router, Pinia, Vitest, ESLint
cd ..
npm install
```

Consume el API en `http://localhost:3000/api/v1` (configurar `VITE_API_URL`).
CORS ya permite `http://localhost:5173` (puerto por defecto de Vite).

Pantallas según el documento: Login, Dashboard, Create Ticket, My Tickets, Ticket Detail,
AI Assistant, Knowledge Base, Reports, Admin.
