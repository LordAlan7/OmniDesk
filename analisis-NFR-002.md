# Análisis del Repositorio OmniDesk frente a NFR-002 — Seguridad de la Información y Confidencialidad

**Sprint de referencia:** Sprint anterior (repositorio analizado en formato Repomix XML)
**Requerimiento:** NFR-002 — Seguridad de la información y confidencialidad
**Prioridad:** Must Have
**Responsable:** Alan Moreno Nevárez
**Apoyo y validación QA:** Edgar Alan Meráz Casas
**Fecha del análisis:** 21 de octubre de 2026

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Resumen del repositorio analizado](#2-resumen-del-repositorio-analizado)
3. [Lo que NFR-002 ya encuentra implementado](#3-lo-que-nfr-002-ya-encuentra-implementado)
4. [Análisis de dependencias declaradas en NFR-002](#4-análisis-de-dependencias-declaradas-en-nfr-002)
5. [Brechas críticas que NFR-002 exige cerrar](#5-brechas-críticas-que-nfr-002-exige-cerrar)
6. [Criterios de aceptación vs estado actual](#6-criterios-de-aceptación-vs-estado-actual)
7. [Riesgos y puntos de atención](#7-riesgos-y-puntos-de-atención)
8. [Plan de trabajo recomendado](#8-plan-de-trabajo-recomendado)
9. [Archivos del repositorio que se verán afectados](#9-archivos-del-repositorio-que-se-verán-afectados)
10. [Conclusiones](#10-conclusiones)

---

## 1. Resumen ejecutivo

El repositorio OmniDesk analizado presenta una **base sólida** para implementar NFR-002. Los controles fundamentales ya están presentes: hash bcrypt para contraseñas, JWT con versión de sesión e invalidación, RBAC completo (NFR-001), consultas parametrizadas en todos los repositorios PostgreSQL, validación estricta con Zod, auditoría inmutable (NFR-009), y headers de seguridad (helmet, no-store, nosniff, sandbox CSP) en endpoints sensibles.

Sin embargo, NFR-002 expone **brechas específicas** que requieren atención antes de cerrar el requerimiento: el almacenamiento de versiones de sesión es **solo en memoria** (inviable en despliegue multi-instancia), no hay **rate limiting**, no hay **documentación de cifrado en reposo ni gestión de claves**, y los módulos `files` (FR-004) y `ai` (FR-013) siguen en esqueleto — pero esto último no bloquea NFR-002: los controles compartidos ya existen y se aplicarán cuando esos módulos se completen.

**Conclusión sobre dependencias:** NFR-002 **sí tiene dependencias cumplidas** en autenticación/autorización/trazabilidad/consistencia. Las dependencias **parcialmente cumplidas** (infraestructura, FR-004, FR-013) no bloquean el inicio del trabajo pero requieren acotar qué controles aplican a lo ya implementado y cuáles quedarán como pendientes.

---

## 2. Resumen del repositorio analizado

### 2.1 Arquitectura

- **Estilo:** Monolito modular en capas, cliente-servidor con API REST `/api/v1`.
- **Backend:** Node.js + Express + TypeScript.
- **Frontend:** Vue 3 + TypeScript + Pinia + Vue Router.
- **Base de datos:** PostgreSQL con migraciones SQL numeradas en `apps/api/db/migrations/`.

### 2.2 Módulos del backend

| Módulo | Requisitos | Estado |
|---|---|---|
| `auth` | FR-001, NFR-001/002 | ✅ Login, me, logout con JWT |
| `users` | FR-002 | ✅ CRUD + roles en PostgreSQL |
| `tickets` | FR-003, 005-010, 018 | ✅ Flujo completo en PostgreSQL |
| `audit` | NFR-009 | ✅ Solo INSERT/SELECT |
| `notifications` | FR-020 | ✅ Bandeja interna + canales registrables |
| `knowledge` | FR-011, FR-012, FR-019 | ⚠️ FR-012 implementado; FR-011/019 en proceso |
| `files` | FR-004, FR-012 | ⚠️ Esqueleto 501; StorageProvider implementado |
| `ai` | FR-013, 014, 015, 021 | ⚠️ Esqueleto 501; AIProvider implementado (mock) |
| `reports` | FR-016, FR-017 | ⚠️ Esqueleto 501 |

### 2.3 Adaptadores externos

| Adaptador | Interfaz | Implementación actual | Selección por entorno |
|---|---|---|---|
| IA | `AIProvider` | `MockAIProvider` | `AI_PROVIDER` (`createAIProvider`) |
| Almacenamiento | `StorageProvider` | `InMemoryStorageProvider` | `STORAGE_PROVIDER` (`createStorageProvider`) |
| Notificaciones externas | `NotificationChannel` | ninguna (solo bandeja interna) | `registerChannel` |

### 2.4 Cumplimiento arquitectónico

`apps/api/src/architecture.test.ts` ya impone:

- `process.env` solo se lee en `config/env.ts`.
- Las rutas no tocan repositorios ni `pg`.
- `pg` solo se importa en repositorios, `shared/db` y `scripts`.
- `shared/` no depende de módulos de negocio.
- Grafo de dependencias entre módulos sin ciclos.
- Un módulo solo importa otro a través de su `index.ts`.

**Esta base arquitectónica es favorable para NFR-002** porque limita la superficie donde pueden aparecer fugas de secretos o accesos indebidos.

---

## 3. Lo que NFR-002 ya encuentra implementado

### 3.1 Contraseñas

- `bcrypt.hash(data.password, 10)` en `apps/api/src/modules/users/users.service.ts`.
- `bcrypt.hashSync('ChangeMe123!', 8)` en seed de demostración.
- `toPublic()` elimina `passwordHash` de cualquier respuesta (en `users.service.ts` y `users.types.ts`).
- `sanitize.ts` bloquea los campos `passwordHash`, `password`, `refreshToken`, `resetToken` aunque se invoque desde otros módulos.

### 3.2 Sesiones

- JWT firmado con `env.jwtSecret` en `apps/api/src/shared/security/jwt.ts`.
- `sessionVersion` por usuario (UUID) que se valida en cada `verifyAccessToken`.
- `invalidateUserSessions(userId)` revoca todas las sesiones previas al:
  - Desactivar una cuenta (`active: false`).
  - Cambiar roles (`setUserRoles`).
- `JWT_EXPIRES_IN` configurable por entorno (default `8h`).
- `JWT_SECRET` obligatorio en producción (lanza en `config/env.ts` si falta).

### 3.3 Autorización

- RBAC completo: `permissions.ts`, `rolePermissions.ts`, `policy.ts`, `requirePermission.ts`.
- Denegación por defecto: lo que no está en la matriz se rechaza.
- Nivel "registro" con `canAccessTicket` que oculta la existencia de tickets ajenos devolviendo 404.
- Combinación de roles por unión de permisos.
- Separación de deberes: Administrator no hace negocio; Manager no asigna; Advisor no prioriza; Technician no cierra.

### 3.4 Validación de entradas

- Zod con `.strict()` en TODOS los schemas (`auth.schemas.ts`, `users.schemas.ts`, `tickets.schemas.ts`, `knowledge.schemas.ts`, `documents.schemas.ts`).
- Los campos no declarados se rechazan (previene mass assignment / field injection).
- `validationRules.ts` es el diccionario centralizado de límites (`STRING_LIMITS`, `MESSAGES`, `CONDITIONAL_RULES`).

### 3.5 Consultas parametrizadas

- Driver `pg` con placeholders `$1, $2, ...` en todos los repositorios PostgreSQL:
  - `users.postgres.repository.ts`
  - `tickets.postgres.repository.ts`
  - `knowledge.postgres.repository.ts`
  - `documents.repository.ts`
  - `document-audit.ts`
- No hay concatenación de SQL con entrada de usuario.

### 3.6 Logs y errores

- `apps/api/src/shared/middleware/errorHandler.ts`:
  - `AppError` controlado expone `{ code, message, details, requestId }`.
  - `ZodError` se traduce a `VALIDATION_ERROR` con detalles por campo.
  - Errores inesperados: el stack se imprime solo en consola del servidor; al cliente solo llega `{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }`.
- `requestId` por petición para correlación.

### 3.7 Auditoría inmutable

- `audit_log` solo permite `INSERT` y `SELECT` (no hay rutas PATCH/DELETE).
- `audit_log.actor_id` con `ON DELETE SET NULL` (conserva trazas aunque el usuario se elimine).
- `recordAudit` no expone campos sensibles por contrato (recibe `metadata` libre, el módulo debe cuidar no incluir secretos).

### 3.8 Headers de seguridad

- `helmet` activo en `app.ts`.
- `Cache-Control: no-store` en `/auth/me`.
- `Cache-Control: private, no-store` en descargas de documentos PDF.
- `X-Content-Type-Options: nosniff` en descargas.
- `Content-Security-Policy: sandbox; default-src 'none'` en descargas.
- `Content-Disposition: attachment` fuerza descarga en lugar de render inline.

### 3.9 Validación de archivos PDF

`apps/api/src/modules/files/document-storage.ts` rechaza:

- Archivos vacíos.
- Tamaño mayor a 10 MB (`MAX_DOCUMENT_BYTES`).
- MimeType distinto de `application/pdf`.
- Magic bytes que no empiecen con `%PDF-`.
- PDFs con JavaScript, JS, Launch, EmbeddedFiles, EmbeddedFile, RichMedia, XFA, OpenAction, AA, SubmitForm, ImportData (recorrido del árbol PDF con límite de profundidad 100).
- PDFs inválidos o corruptos.

### 3.10 Frontend sin acceso a BD ni secretos

- Cliente HTTP único en `apps/api/src/api/http.ts` (token Bearer, manejo global de 401, `ApiError` clasificado en `network`/`server`/`client`).
- Ninguna vista usa `fetch` directamente ni conoce PostgreSQL.
- Token único `omnidesk.token` en `sessionStorage`, administrado exclusivamente por el store Pinia de sesión.
- `setUnauthorizedHandler` limpia sesión y redirige a `/login?reason=expired` en cualquier 401 en una ruta protegida.
- `/auth/me` no usa cache y es la fuente de verdad para permisos vigentes.

### 3.11 Defensa por defecto en IA

- `knowledge_documents.ai_authorized BOOLEAN NOT NULL DEFAULT FALSE CHECK (ai_authorized = FALSE)` en `003_knowledge_documents.sql`.
- Esto fuerza que ningún documento se envíe a IA sin autorización explícita (cuando FR-013 se implemente).

---

## 4. Análisis de dependencias declaradas en NFR-002

| Dependencia | Estado | Observaciones para NFR-002 |
|---|---|---|
| **FR-001 + NFR-001** (auth, sesiones, autorización) | ✅ Cumplida | Base sólida: hash bcrypt, JWT con versión, RBAC. Solo falta **documentar algoritmo y parámetros** y elegir mecanismo de transporte/almacenamiento de sesión. |
| **Base de datos e infraestructura** | ⚠️ Parcial | PostgreSQL migrado y restricciones aplicadas. **Falta:** cifrado en reposo documentado, cuenta de aplicación con permisos mínimos, procedimiento de respaldos, gestión de claves. |
| **FR-004 + FR-012** (carga y recuperación de archivos) | ⚠️ Parcial | FR-012 implementado (manuales PDF con control de acceso y audit). **FR-004 sigue en esqueleto 501**: faltan adjuntos de tickets. Los controles compartidos ya existen (`validateDocumentPdf`, `MAX_DOCUMENT_BYTES`, `storeDocumentFile`, `readDocumentFile`). |
| **FR-013** (proveedor de IA y contexto permitido) | ⚠️ Esqueleto | `AIProvider` y `MockAIProvider` existen. El campo `ai_authorized` ya garantiza que nada se envía a IA sin autorización. **Falta:** implementar filtrado real cuando se integre un proveedor concreto. |
| **Política de datos** (info sensible, conservación, accesos admin) | ⚠️ Pendiente | No hay documento de clasificación de datos. El `audit` registra accesos, pero falta definir retención y quién accede a respaldos. |
| **NFR-009** (trazabilidad) | ✅ Cumplida | Audit module con `INSERT/SELECT` únicamente, FK con `ON DELETE SET NULL`. |
| **NFR-010** (consistencia de datos) | ✅ Cumplida | `validationRules.ts`, constraints condicionales en `003_tickets_constraints.sql`, versionado optimista con `version` en `tickets`. |

### 4.1 Coordinación con otros NFR

- **NFR-004** (recuperación y continuidad): fuera de alcance de NFR-002, pero hay que dejar ganchos (respaldos cifrados, gestión de claves).
- **NFR-009** (trazabilidad): ya cubierta. NFR-002 solo debe asegurar que los logs de audit no incluyan secretos.
- **NFR-010** (consistencia de datos): ya cubierta. NFR-002 no debe debilitar las constraints existentes.

---

## 5. Brechas críticas que NFR-002 exige cerrar

### 5.1 Sesiones (alta prioridad)

- **`sessionVersions` está en memoria** en `apps/api/src/shared/security/jwt.ts` (`Map<number, string>`). En despliegue multi-instancia (Vercel, Kubernetes) la invalidación no se propaga entre instancias. **Decisión pendiente:** mover a Redis o a una tabla `user_sessions` en PostgreSQL.
- Falta **documentar algoritmo JWT, tiempo de expiración y mecanismo de transporte**.
- No hay **límite de intentos de login** (`express-rate-limit` no está configurado). NFR-002 lo exige explícitamente: "Implementar límites de intentos según una política acordada, sin fijar cifras arbitrarias."
- **CSRF:** como se usa Bearer en `sessionStorage` y no cookies, el riesgo es bajo, pero hay que **documentar** esta decisión y los atributos de cookie que se aplicarían si cambiara (`HttpOnly`, `Secure`, `SameSite=Strict`).

### 5.2 Comunicaciones

- **HTTPS** no está forzado en código (debe depender del reverse proxy / proveedor). Falta **HSTS explícito** documentado y **redirección HTTP → HTTPS** en producción.
- Conexiones a PostgreSQL, almacenamiento y proveedor de IA deben usar TLS. **Falta verificar y documentar** la configuración del entorno desplegado.
- `cors({ origin: env.corsOrigin })` ya está configurado. Hay que **documentar que no sustituye autorización** (cumplido por diseño: `authenticate` + `requirePermission`).

### 5.3 Datos persistentes

- No hay documentación sobre **cifrado en reposo** (column-level con `pgcrypto` para campos sensibles como `password_hash`, o TDE del proveedor gestionado).
- No hay **cuenta de aplicación con permisos mínimos** documentada (la `DATABASE_URL` actual puede tener más privilegios de los necesarios).
- No hay procedimiento de **respaldos cifrados**.
- No hay **gestión de claves** documentada (rotación, almacenamiento en bóveda, separación por entorno).

### 5.4 Secretos

- `JWT_SECRET` ya se exige en producción (`config/env.ts`).
- `OPENAI_API_KEY` se lee de `process.env` correctamente.
- `architecture.test.ts` ya impide que se lea `process.env` fuera de `config/env.ts`.
- **Falta:** procedimiento de **sustitución de credenciales comprometidas** y separación por entorno (development/production) con valores distintos.

### 5.5 Entradas y contenido

- Zod ya valida con `.strict()`.
- **Falta verificar formalmente** que ningún `.vue` use `v-html` con contenido de tickets, artículos o respuestas de IA. Revisión preliminar: no se encontró `v-html` en el código analizado, pero debe verificarse al desplegar FR-013 y al crear nuevas vistas.
- **CORS** ya está configurado. Hay que **documentar la regla de orígenes permitidos** del despliegue.

### 5.6 Límites de solicitudes y cargas

- No hay rate limiting global ni por endpoint.
- `multer` ya limita `fileSize: MAX_DOCUMENT_BYTES` (10 MB), `files: 1`, `fields: 8`, `parts: 9`, `fieldSize: 8192`.
- `express.json({ limit: '1mb' })` ya limita el body JSON.
- **Falta:** definir política de rate limiting para `/auth/login`, creación de tickets y consultas a IA.

### 5.7 Logs y errores

- `errorHandler.ts` ya no expone trazas. ✅
- **Falta:** revisar que `recordAudit` nunca reciba contraseñas, tokens ni datos sensibles en `metadata`. Casos verificados:
  - `auth.login_failed` registra `metadata: { email }` ✅ (no expone contraseña).
  - `auth.login` y `auth.logout` no incluyen secretos ✅.
  - `user.updated` registra `after: { name, email, roles, active }` ✅ (no incluye `passwordHash`).
  - `ticket.*` registra `metadata: { from, to }` con IDs ✅.
- **Pendiente:** definir política formal de retención de logs y accesos administrativos a los mismos.

### 5.8 Integraciones de IA

- `ai_authorized = FALSE` forzado por constraint en `003_knowledge_documents.sql`. ✅ Excelente defensa por defecto.
- `MockAIProvider` no llama a servicios externos. ✅
- `AIAnswer` siempre devuelve `aiGenerated: true` (cumple NFR-003).
- **Falta:** cuando se integre OpenAI u otro proveedor:
  - **Filtrar el contexto** enviado según `ai_authorized` y permisos del usuario.
  - **Documentar qué información permanece en cada servicio** (proveedor externo, logs propios, etc.).
  - Definir **tratamiento de información sensible** (PII) antes de enviarla.

---

## 6. Criterios de aceptación vs estado actual

| # | Criterio NFR-002 | Estado | Evidencia |
|---|---|---|---|
| 1 | Contraseñas almacenadas mediante mecanismo de hash documentado | ⚠️ Parcial | bcrypt cost=10 aplicado; falta documentar parámetros formalmente |
| 2 | Credenciales y tokens no aparecen en respuestas, frontend ni logs | ✅ Cumplido | `toPublic`, `sanitize.ts`, `errorHandler.ts` |
| 3 | Sesiones cumplen reglas de expiración e invalidación de FR-001 | ⚠️ Parcial | JWT con `sessionVersion` funciona; limitado a instancia única (memoria) |
| 4 | Conexiones sensibles con protección configurada y verificada | ⚠️ Pendiente | Falta configurar y verificar HTTPS + TLS a BD/IA |
| 5 | BD, archivos y respaldos con mecanismos de protección persistente | ❌ Pendiente | Falta documentar y configurar |
| 6 | Consultas parametrizadas impiden SQL injection | ✅ Cumplido | Todos los repositorios PostgreSQL con placeholders |
| 7 | Contenido de tickets/docs/IA no ejecuta scripts en vistas | ✅ Cumplido | Vue no usa `v-html` en el código revisado |
| 8 | API rechaza campos o acciones fuera de permisos del usuario | ✅ Cumplido | RBAC + Zod `.strict()` |
| 9 | Archivos protegidos no quedan públicos permanentemente | ✅ Cumplido | FR-012 con `Cache-Control: private, no-store` |
| 10 | Medidas de cookies, CSRF y orígenes documentadas | ⚠️ Pendiente | No se usan cookies (Bearer en `sessionStorage`); CORS configurado; falta documentar |
| 11 | Errores no exponen secretos, trazas ni detalles innecesarios | ✅ Cumplido | `errorHandler.ts` |
| 12 | Contexto enviado a IA solo con información necesaria y autorizada | ⚠️ Parcial | `ai_authorized = FALSE` por defecto; falta implementación real del filtro |
| 13 | Límites de solicitudes y cargas cumplen política acordada | ❌ Pendiente | Sin rate limiting |
| 14 | Verificaciones y hallazgos documentados con evidencia QA | ❌ Pendiente | Queda del lado de QA (Edgar Alan Meráz Casas) |

**Resumen de criterios:** 6 ✅ cumplidos · 5 ⚠️ parciales · 3 ❌ pendientes.

---

## 7. Riesgos y puntos de atención

1. **No se requiere nueva pantalla de seguridad** (lo dice el propio requerimiento). Los controles deben integrarse en vistas y servicios existentes. ✅ Enfoque correcto y ya alineado con la arquitectura actual.

2. **Coordinación con NFR-004 (recuperación) y NFR-009 (trazabilidad)** ya cubierta esta última. NFR-004 queda fuera de alcance pero hay que dejar ganchos (respaldos cifrados, gestión de claves).

3. **Decisiones pendientes explícitas en el requerimiento** (mecanismos de hash, sesión, cifrado, gestión de claves, límites, conservación, contexto IA). Conviene **documentarlas y aprobarlas con el equipo** antes de codificar, para no producir rework. Estas decisiones son:
   - Algoritmo de hash y sus parámetros (cost factor).
   - Mecanismo de transporte y almacenamiento de sesión (Bearer + sessionStorage actual, o cookies HttpOnly + Secure).
   - Configuración de cifrado del proveedor (PostgreSQL TDE, pgcrypto column-level, o nada).
   - Gestión de claves (variables de entorno, bóveda, KMS).
   - Límites de solicitudes (login, IA, cargas).
   - Conservación de datos (logs, respaldos, sesiones expiradas).
   - Tratamiento de información enviada a servicios externos (IA).

4. **El constraint `ai_authorized = FALSE CHECK (ai_authorized = FALSE)`** es un bloqueo defensivo excelente, pero al implementar FR-013 se debe levantar con un procedimiento controlado. NFR-002 debe definir ese procedimiento (quién autoriza, cómo se audita, cómo se revoca).

5. **`sessionVersions` en memoria** es el riesgo técnico más alto: si el despliegue es multi-instancia, la invalidación falla y un usuario desactivado podría seguir operando hasta que expire su token (hasta 8h por defecto). Hay que resolverlo antes de producción.

6. **CODEOWNERS:** NFR-002 cruza múltiples módulos (`auth`, `users`, `files`, `knowledge`, `ai`, `shared/security`). El responsable **Alan Moreno Nevárez** debe coordinar con los dueños de cada módulo para no romper el gate de Code Owners en PRs. El archivo `.github/CODEOWNERS` debe actualizarse con los usuarios reales de GitHub antes de iniciar.

7. **Pruebas de integración omitidas:** 14 pruebas requieren `TEST_DATABASE_URL`. NFR-002 debe agregar pruebas de seguridad que cubran los nuevos controles (accesos indebidos, SQL injection, XSS, archivos públicos, sesiones invalidadas, secretos expuestos).

---

## 8. Plan de trabajo recomendado

### Fase 1 — Documentación y decisiones (sin código)

- Algoritmo y coste de hash (bcrypt cost ≥ 12 recomendado para producción).
- Mecanismo de sesión: almacenamiento (Redis o tabla `user_sessions` en PostgreSQL), expiración, transporte.
- Política de rate limiting (login, IA, cargas).
- Política de retención de logs y datos sensibles.
- Procedimiento de rotación de credenciales comprometidas.
- Política de clasificación de datos (qué campos son sensibles, PII, confidenciales).
- Procedimiento de autorización para IA (`ai_authorized`).

### Fase 2 — Implementación backend

- Documentar y unificar parámetros de bcrypt (eliminar `cost=8` del seed; usar `cost=12` mínimo en producción).
- Migrar `sessionVersions` a almacenamiento compartido (si el despliegue lo exige).
- Añadir `express-rate-limit` en `/auth/login` y en endpoints sensibles.
- Headers HSTS y verificación de configuración de producción.
- Revisar metadata de audit para asegurar que nunca incluya secretos.
- Middleware de logging que filtre campos sensibles antes de `console.error`.

### Fase 3 — Infraestructura

- Configurar cuenta de aplicación con permisos mínimos en PostgreSQL (solo INSERT/SELECT en `audit_log`, SELECT/INSERT/UPDATE según módulo en sus tablas).
- Documentar cifrado en reposo y respaldos.
- Documentar gestión de claves y separación por entorno.
- Configurar HTTPS con redirección HTTP → HTTPS y HSTS en el reverse proxy.

### Fase 4 — Validación

- Pruebas de acceso indebido (manipulación de campos, IDs ajenos).
- Pruebas de SQL injection (en endpoints de búsqueda y listados).
- Pruebas de XSS en tickets, artículos y respuestas de IA (cuando FR-013 se implemente).
- Verificar archivos públicos accidentalmente expuestos.
- Verificar sesiones invalidadas no siguen operando.
- Verificar secretos no expuestos en respuestas ni logs.
- Revisar configuración de despliegue y dependencias (`npm audit`).
- Evidencia para QA (Edgar Alan Meráz Casas).

---

## 9. Archivos del repositorio que se verán afectados

### 9.1 Backend — archivos a modificar o crear

| Archivo | Cambios esperados |
|---|---|
| `apps/api/src/config/env.ts` | Añadir configuración de rate limiting, sesión compartida, política de retención |
| `apps/api/src/shared/security/jwt.ts` | Migrar `sessionVersions` a almacenamiento compartido (Redis o PostgreSQL) |
| `apps/api/src/shared/security/guards.ts` | Documentar flujo de validación de cuenta activa |
| `apps/api/src/app.ts` | Añadir middleware de rate limiting, HSTS, headers adicionales |
| `apps/api/src/shared/middleware/errorHandler.ts` | Asegurar que `console.error` no imprima secretos (sanitización de logs) |
| `apps/api/src/modules/auth/auth.routes.ts` | Aplicar rate limiting en `/auth/login` |
| `apps/api/src/modules/auth/auth.service.ts` | Documentar parámetros de hash; revisar metadata de audit |
| `apps/api/src/modules/users/users.service.ts` | Unificar cost de bcrypt a ≥12; revisar metadata de audit |
| `apps/api/src/modules/users/users.repository.ts` | Eliminar `hashSync(..., 8)` del seed |
| `apps/api/src/modules/users/users.postgres.repository.ts` | Verificar permisos de cuenta de aplicación |
| `apps/api/src/modules/ai/ai.routes.ts` | Implementar con filtrado de contexto autorizado |
| `apps/api/src/modules/ai/providers/index.ts` | Registrar proveedor real con manejo seguro de credenciales |
| `apps/api/src/modules/files/files.routes.ts` | Implementar FR-004 con rate limiting y validación |
| `apps/api/db/migrations/007_security_*.sql` | Nueva migración: tabla `user_sessions` si se elige PostgreSQL, índices adicionales, constraints de seguridad |
| `apps/api/package.json` | Añadir `express-rate-limit`, `redis` o `ioredis` (si aplica), `helmet` ya presente |
| `apps/api/.env.example` | Documentar nuevas variables de entorno |

### 9.2 Frontend — archivos a modificar o crear

| Archivo | Cambios esperados |
|---|---|
| `apps/web/src/api/http.ts` | Documentar manejo de 401 y políticas de retry |
| `apps/web/src/views/*.vue` | Verificar que no se use `v-html` con contenido de tickets, artículos o IA |
| `apps/web/src/views/LoginView.vue` | Mostrar feedback de rate limiting al usuario |

### 9.3 Documentación

| Archivo | Cambios esperados |
|---|---|
| `docs/SECURITY.md` (nuevo) | Documentar algoritmo de hash, parámetros JWT, gestión de claves, límites, conservación, procedimiento de rotación |
| `docs/AUTHORIZATION.md` | Actualizar con referencia a NFR-002 |
| `docs/ARCHITECTURE.md` | Actualizar registro de decisiones con NFR-002 |
| `.github/CODEOWNERS` | Reemplazar `@usuarioN` por usuarios reales |
| `.github/pull_request_template.md` | Añadir checklist de seguridad |
| `README.md` | Añadir referencia a `docs/SECURITY.md` |

---

## 10. Conclusiones

1. **NFR-002 es implementable sobre la base actual** sin rework arquitectónico significativo. Las decisiones de diseño previas (Bearer en `sessionStorage`, RBAC estricto, audit inmutable, validación Zod `.strict()`) son compatibles con el requerimiento.

2. **Las dependencias declaradas están en su mayoría cumplidas** (FR-001, NFR-001, NFR-009, NFR-010). Las parcialmente cumplidas (infraestructura, FR-004, FR-013) no bloquean el inicio pero requieren acotar el alcance.

3. **El riesgo técnico más alto** es el almacenamiento en memoria de `sessionVersions`. Debe resolverse antes de cualquier despliegue multi-instancia.

4. **La defensa por defecto en IA** (`ai_authorized = FALSE CHECK (ai_authorized = FALSE)`) es una decisión de diseño excelente que NFR-002 solo necesita formalizar con un procedimiento de autorización.

5. **La mayoría de los criterios de aceptación** (6 de 14) ya están cumplidos o parcialmente cumplidos por el código existente. El trabajo se concentra en documentación, infraestructura y rate limiting, no en reescribir controles.

6. **Se recomienda iniciar por la Fase 1 (documentación y decisiones)** antes de codificar, para evitar rework y alinear al equipo sobre los parámetros finales (cost de bcrypt, mecanismo de sesión, límites de rate limiting, etc.).

---

## Anexo: Próximos pasos sugeridos

1. **Sesión de definición de parámetros** con Alan Moreno Nevárez y Edgar Alan Meráz Casas para cerrar las decisiones pendientes listadas en la sección 7.
2. **Actualización de `.github/CODEOWNERS`** con usuarios reales de GitHub antes del primer PR de NFR-002.
3. **Creación de `docs/SECURITY.md`** como fuente de verdad de los parámetros y procedimientos de seguridad.
4. **Apertura de issue/PR por cada brecha crítica** (sección 5) para trazabilidad en el sprint.
5. **Coordinación con responsables de `files` y `ai`** (según CODEOWNERS) para asegurar que los controles compartidos se aplican al implementar FR-004 y FR-013.
