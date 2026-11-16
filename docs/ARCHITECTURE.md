# Arquitectura (resumen operativo)

Derivada del documento *A5 Software Solution Architecture and Design*.

**Estilo:** Monolito modular + capas + cliente-servidor/API REST. Un solo despliegue, fronteras internas estrictas (NFR-007).

## Grafo de dependencias entre módulos

```
auth ───────► users ───────► audit
tickets ────► users, audit, notifications
files ──────► tickets, audit
knowledge ──► files, audit
ai ─────────► knowledge, tickets, audit
reports ────► tickets
notifications, audit: sin dependencias de otros módulos
```

Todo módulo también puede usar `shared/` (errores, seguridad, helpers HTTP, BD).

## Capas (backend `apps/api/src`)

| Capa | Dónde vive | Responsabilidad | No debe |
|---|---|---|---|
| Entrada de API | `modules/<m>/<m>.routes.ts`, `<m>.schemas.ts` | Rutas, validación del contrato (zod), permisos HTTP, llamar al servicio | Contener reglas de negocio, importar repositorios ni `pg` |
| Aplicación y negocio | `modules/<m>/<m>.service.ts` (+ `.lifecycle.ts`) | Casos de uso, reglas de operación, auditoría, notificaciones | Conocer Express ni SQL |
| Acceso a datos | `modules/<m>/<m>.repository.ts`, `*.postgres.repository.ts`, `shared/db/` | Consultas, persistencia, transacciones | Aplicar reglas de negocio |
| Adaptadores externos | `modules/ai/providers/`, `modules/files/storage/`, `NotificationChannel` | Hablar con IA, almacenamiento y canales de notificación detrás de una interfaz | Exponer credenciales o usarse sin pasar por su factoría |
| Compartido | `shared/`, `config/env.ts` | Errores, seguridad/JWT, autorización (RBAC), helpers HTTP, conexión BD, configuración | Importar un módulo de negocio |

Presentación: `apps/web/src` (ver más abajo). El frontend solo habla con la API REST; nunca con PostgreSQL.

## Módulos: qué administra cada uno

| Módulo | Datos y operaciones que posee | Estado |
|---|---|---|
| `auth` | Login, perfil de sesión (`/auth/me`), logout, emisión de JWT | Implementado |
| `users` | Cuentas, roles, activación; reglas de ciclo de vida del técnico | Implementado (PostgreSQL) |
| `tickets` | Tickets, estados, prioridad, asignación, historial | Implementado (memoria) |
| `audit` | Registro de trazabilidad (solo `INSERT`/`SELECT`) | Implementado |
| `notifications` | Bandeja interna + canales externos registrables | Implementado (memoria) |
| `files` | Adjuntos; interfaz `StorageProvider` | Esqueleto + adaptador |
| `knowledge` | Base de conocimiento | Esqueleto |
| `ai` | Asistente y revisión humana; interfaz `AIProvider` | Esqueleto + adaptador |
| `reports` | Reportes sobre tickets | Esqueleto |

Reglas de propiedad de datos:

- Un módulo **solo modifica sus propios datos**. Para actuar sobre datos ajenos llama a la **API pública** (`index.ts`) del módulo dueño, nunca a su repositorio.
- La **autorización** vive en `shared/authorization` (permisos y política) y la **trazabilidad** en `audit` (`recordAudit`). Los demás módulos las usan; no las reimplementan.
- **Transacciones**: las controla el servicio del módulo que inicia la operación; el repositorio solo ejecuta dentro de la transacción recibida. Una operación que afecta a varios módulos se coordina desde el servicio del módulo que la origina, que llama a los demás por su `index.ts`.
- **Inversión para romper ciclos**: `users` necesita saber si un técnico tiene tickets abiertos, pero no puede importar `tickets`. `app.ts` (raíz de composición) inyecta la comprobación con `configurePendingTicketsChecker`.

Estas reglas se **verifican automáticamente** en `apps/api/src/architecture.test.ts`: grafo declarado sin ciclos; imports entre módulos solo por `index.ts` y dependencias permitidas; rutas sin repositorios ni `pg`; `pg` solo en repositorios, `shared/db` y `scripts`; `process.env` solo en `config/env.ts`; `shared/` sin dependencias de módulos.

## Adaptadores externos

| Adaptador | Interfaz | Implementación actual | Selección por entorno |
|---|---|---|---|
| IA | `AIProvider` | `MockAIProvider` | `AI_PROVIDER` (`createAIProvider`) |
| Almacenamiento | `StorageProvider` | `InMemoryStorageProvider` | `STORAGE_PROVIDER` (`createStorageProvider`) |
| Notificaciones externas | `NotificationChannel` | ninguna (solo bandeja interna) | `registerChannel` |

Para añadir un proveedor real: implementar la interfaz, registrarlo en la factoría y leer sus credenciales en `config/env.ts`. Las pruebas usan siempre el mock (`adapters.test.ts`). Las credenciales (`OPENAI_API_KEY`, etc.) solo existen en el servidor; el frontend nunca las recibe. Un canal de notificación que falle no interrumpe la operación de negocio.

## Frontend (`apps/web/src`)

| Carpeta | Responsabilidad |
|---|---|
| `api/http.ts` | **Único cliente HTTP**: token Bearer, formato `{data, meta}`, `ApiError` (clasifica `network`/`server`/`client`) y manejo global de 401. `api()` devuelve `data`; `apiPage()` devuelve `data` + `meta` |
| `services/` | Funciones por área sobre el cliente (`users.ts`, `session.ts`); sin `fetch` propio |
| `stores/` | Estado global (Pinia): sesión y permisos (solo para UI; el servidor decide) |
| `views/`, `composables/` | Pantallas y lógica reutilizable de acceso/formularios |
| `router/` | Rutas y guardas |

Reglas: ninguna vista llama a `fetch` ni conoce PostgreSQL; todo error de API es el mismo `ApiError`. Los tipos de contrato (`User`, `SessionUser`) viven hoy en el frontend y deben coincidir con `users.types.ts`; cuando crezcan se moverán a `packages/shared`.

## Cómo ejecutar, probar y migrar

```bash
npm install
cp apps/api/.env.example apps/api/.env      # configuración por entorno (nunca subir .env)
npm run dev:api                              # API en http://localhost:3000
npm run typecheck                            # tipos del API
npm run test:api                             # pruebas del API (incluye architecture.test.ts y adapters.test.ts)
npm run dev -w apps/web                      # frontend en http://localhost:5173
npm exec -w apps/web -- vitest run           # pruebas del frontend
npm exec -w apps/web -- vue-tsc --build      # tipos del frontend
```

Sin `DATABASE_URL` el módulo `users` solo funciona en memoria en pruebas; en desarrollo requiere PostgreSQL. Las migraciones SQL están numeradas en `apps/api/db/migrations/` y se aplican en orden con `psql`; el procedimiento completo y las pruebas de integración (`TEST_DATABASE_URL`) están en `docs/FR-002-README.md`.

## ¿Dónde implemento un cambio?

| Quiero… | Toco |
|---|---|
| Un endpoint nuevo | `routes` + `schemas` del módulo y un caso de uso en su `service` |
| Una regla de negocio | El `service` del módulo (nunca la ruta) |
| Una consulta o columna | `repository` del módulo + migración nueva `00N_*.sql` |
| Usar otro módulo | Importar de su `index.ts`; si no está permitido, primero acordar el cambio en `ALLOWED` y registrarlo aquí |
| Cambiar de proveedor de IA/almacenamiento | Implementar la interfaz y registrarla en su factoría |
| Una pantalla | `views/` + función en `services/`; el cliente HTTP no se toca |

**Cambio representativo verificado:** el filtrado del listado de usuarios (búsqueda/rol/estado) estaba en `users.routes.ts`; ahora es `searchUsers` en `users.service.ts`. Impacto: solo el módulo `users` (ruta y servicio), sin cambio del contrato HTTP ni de otros módulos; cubierto por `users.test.ts`.

## Decisiones tomadas al armar el esqueleto

| Tema | Decisión | Motivo |
|---|---|---|
| `authenticate` / `requireRole` | Viven en `shared/security`, no en `auth/` | Evita el ciclo `auth ⇄ users`. |
| `files` ⇄ `tickets` | `files` depende de `tickets`; `tickets` **no** importa `files` | El documento lista dependencia en ambos sentidos; se rompe el ciclo en una dirección. |
| `ai` + AI Validation | Un solo módulo `ai` | La validación humana (FR-015) es parte del flujo de IA; separar luego si crece. |
| Proveedor de IA | Interfaz `AIProvider` + `MockAIProvider` | Permite cambiar OpenAI por otro servicio sin tocar el resto. |
| Persistencia | Repositorios con interfaz estable; `users` ya en PostgreSQL, el resto en memoria | Se migra módulo por módulo sin tocar servicios. |
| Ticket ajeno | Responde `404`, no `403` | No revelar la existencia de tickets de otros. |
| Login fallido | Mensaje genérico | No revelar si el correo existe. |
| Auditoría | Solo `INSERT`/`SELECT`, sin rutas de modificación | NFR-009. |

## Pendientes que dependen de decisiones del cliente (preguntas abiertas del documento)

- Categorías, niveles de prioridad y criterios (P1, P2): `PRIORITIES` y los estados son **provisionales** en `tickets.types.ts`.
- Canal de notificaciones externo (P6): hoy solo notificaciones internas.
- ¿Quién crea tickets? (P11): hoy pueden crear `Employee` y `Service Advisor`.
- Despliegue en Vercel con Express: requiere adaptar a funciones serverless o elegir otro host para el API.

## Registro de decisiones (NFR-007)

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-18 | Un solo cliente HTTP en el frontend (`api/http.ts`); se elimina `services/api.ts` | Había dos clientes con dos `ApiError` y dos almacenes de token: un 401 podía dejar la sesión en memoria viva o fallar `instanceof`. |
| 2026-10-18 | Listado de usuarios, perfil (`/auth/me`) y auditoría de logout pasan de rutas a servicios | Las rutas no deben concentrar reglas de negocio. |
| 2026-10-18 | Factorías de adaptadores (`createAIProvider`, `createStorageProvider`) y `NotificationChannel` | Integraciones detrás de interfaces, configuradas por entorno y probables sin proveedor real. |
| 2026-10-18 | `architecture.test.ts` verifica ciclos, rutas sin acceso a datos, uso de `pg` y de `process.env` | Hacer cumplir automáticamente los límites del monolito. |
