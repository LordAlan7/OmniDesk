# OmniDesk

Plataforma centralizada de gestión de servicios de TI y conocimiento (tickets + base de conocimiento + asistente de IA).

**Arquitectura:** Monolito modular · Arquitectura por capas · Cliente-Servidor (API REST `/api/v1`).
Detalle en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estructura

```
omnidesk/
├── apps/
│   ├── api/                 # Backend Node.js + Express + TypeScript
│   │   ├── src/
│   │   │   ├── modules/     # Un directorio por módulo (ver tabla abajo)
│   │   │   ├── shared/      # Errores, seguridad (JWT/RBAC), middlewares, BD
│   │   │   ├── config/      # Variables de entorno
│   │   │   ├── app.ts       # Monta los routers de cada módulo
│   │   │   └── server.ts
│   │   └── db/migrations/   # Esquema SQL de referencia (PostgreSQL)
│   └── web/                 # Frontend Vue.js (pendiente de crear, ver apps/web/README.md)
├── packages/shared/         # Tipos compartidos front/back (opcional, futuro)
├── docs/                    # Documentación de arquitectura
└── .github/                 # CI, CODEOWNERS, plantilla de PR
```

## Módulos del backend

| Módulo | Requisitos | Estado |
|---|---|---|
| `auth` | FR-001, NFR-001/002 | ✅ login / me / logout con JWT |
| `users` | FR-002 | ✅ CRUD + roles (solo Administrator) |
| `tickets` | FR-003, 005–010, 018 | ✅ **flujo completo** (módulo de ejemplo) |
| `audit` | NFR-009 | ✅ solo agregar y leer |
| `notifications` | FR-020 | ✅ internas (canal externo pendiente) |
| `files` | FR-004, FR-012 | 🚧 esqueleto (responde 501) |
| `knowledge` | FR-011, 012, 019 | 🚧 esqueleto (responde 501) |
| `ai` | FR-013, 014, 015, 021 | 🚧 esqueleto + interfaz `AIProvider` |
| `reports` | FR-016, FR-017 | 🚧 esqueleto (responde 501) |

Los repositorios son **en memoria** para que todo corra sin base de datos. Cada responsable
migra el suyo a PostgreSQL manteniendo la misma interfaz (`apps/api/db/migrations/001_init.sql`).

## Arranque rápido

Requisitos: Node.js 20+.

```bash
git clone <URL-DEL-REPO>
cd omnidesk
npm install
cp .env.example apps/api/.env      # edita JWT_SECRET
npm run dev:api                    # http://localhost:3000/api/v1/health
```

Otros comandos:

```bash
npm run test:api     # Jest + Supertest (incluye pruebas de arquitectura)
npm run typecheck
npm run build:api
```

### Usuarios de demostración (solo desarrollo)

Contraseña de todos: `ChangeMe123!`

| Correo | Rol |
|---|---|
| employee@company.com | Employee |
| technician@company.com | Technician |
| advisor@company.com | Service Advisor |
| manager@company.com | Manager |
| admin@company.com | Administrator |

### Probar el flujo de un ticket

```bash
# 1. Login
curl -s -X POST localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"employee@company.com","password":"ChangeMe123!"}'

# 2. Crear ticket (usa el accessToken devuelto)
curl -s -X POST localhost:3000/api/v1/tickets -H "Authorization: Bearer <TOKEN>" \
  -H 'Content-Type: application/json' \
  -d '{"title":"No puedo entrar al sistema","description":"Error de autenticación","categoryId":2}'
```

Ciclo del ticket: `Open → Assigned → In Progress → Resolved → Closed`
(`PATCH /tickets/:id/assignment` → `PATCH …/status` → `POST …/resolution` → `POST …/close`).

## Cómo trabajamos en equipo

1. Ramas protegidas: `main` y `develop` (PR obligatorio + 1 aprobación + CI verde).
2. Cada quien trabaja en `feature/<modulo>-<descripcion>` y abre PR hacia `develop`.
3. Commits tipo `feat(tickets): ...`, `fix(auth): ...`, `docs: ...`.
4. `.github/CODEOWNERS` asigna responsable por módulo: **reemplaza `@usuarioN` por los usuarios reales**.

## Reglas de la arquitectura modular (se validan en CI)

1. Un módulo **solo** importa de otro a través de su `index.ts` (nunca `../tickets/tickets.service`).
2. Solo se permiten las dependencias declaradas en `apps/api/src/architecture.test.ts` (grafo sin ciclos).
3. `shared/` nunca importa de ningún módulo.
4. Dentro de un módulo: `routes → service → repository` (nada de SQL fuera del repository).
5. Las acciones importantes llaman a `recordAudit(...)`; los cambios visibles al usuario a `notify(...)`.
6. Las respuestas siempre usan `{ data }` o `{ error: { code, message, details, requestId } }`.

## Cómo implementar un módulo

Usa `tickets/` como plantilla:

```
modulo/
├── modulo.routes.ts       # Endpoints + authenticate/requireRole
├── modulo.schemas.ts      # Validación con zod
├── modulo.service.ts      # Reglas de negocio y permisos
├── modulo.repository.ts   # Acceso a datos
├── modulo.types.ts
├── modulo.test.ts         # Jest + Supertest
└── index.ts               # API pública del módulo
```

Pasos: (1) schema, (2) repository, (3) service con sus reglas, (4) rutas, (5) pruebas,
(6) exporta solo lo necesario en `index.ts`, (7) abre el PR.

## Seguridad

Parámetros, políticas y procedimientos de seguridad (NFR-002) en [docs/SECURITY.md](docs/SECURITY.md).
