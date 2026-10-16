# apps/web (Vue 3 + TypeScript + Pinia + Vue Router)

```bash
cd apps/web
npm install            # si falla con "edgesOut": npm install --legacy-peer-deps
cp .env.example .env   # VITE_API_URL
npm run dev            # http://localhost:5173
npm run test:unit      # Vitest
npm run test:e2e       # Cypress (API corriendo; levanta preview en :4173)
npm run lint           # oxlint + ESLint
npm run build          # type-check + build de producción
```

## Estructura

- Sesión: `src/api/http.ts` (cliente), `src/stores/session.ts` (estado Pinia), `src/router/index.ts` (guards por permisos).
- Gestión de usuarios (FR-002): `src/views/UsersView.vue`, `CreateUserView.vue`, `EditUserView.vue`,
  con `src/services/users.ts`. `src/services/session.ts` es un adaptador sobre el store de sesión,
  para que ambas partes compartan la misma sesión.
