# apps/web (Vue 3 + TypeScript + Pinia + Vue Router)

```bash
cd apps/web
npm install            # si falla con "edgesOut": npm install --legacy-peer-deps
cp .env.example .env   # VITE_API_URL
npm run dev            # http://localhost:5173
npm run test:unit      # Vitest
npm run test:e2e       # Cypress (API y web corriendo)
```
Estructura de sesión: `src/api/http.ts` (cliente), `src/stores/session.ts` (estado), `src/router/index.ts` (guards).
