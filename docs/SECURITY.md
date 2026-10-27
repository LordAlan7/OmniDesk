# Seguridad de la información y confidencialidad (NFR-002)

Fuente de verdad de los parámetros y procedimientos de seguridad. Los valores marcados **(por aprobar)** son decisiones pendientes del equipo.

## 1. Contraseñas
- Algoritmo: **bcrypt** (`bcryptjs`). Coste configurable con `BCRYPT_COST`: **12** en producción, 10 en desarrollo, 4 en pruebas.
- `passwordHash` nunca sale del servicio de usuarios (`toPublic`) y `sanitize.ts` bloquea `password`, `passwordHash`, `refreshToken`, `resetToken`.

## 2. Sesiones
- JWT firmado con `JWT_SECRET` (HS256, obligatorio en producción), expiración `JWT_EXPIRES_IN` (por defecto `8h`).
- Transporte: cabecera `Authorization: Bearer`; el frontend lo guarda en `sessionStorage`. **No se usan cookies**, por lo que CSRF no aplica. Si se migrara a cookies: `HttpOnly`, `Secure`, `SameSite=Strict` y protección CSRF.
- Invalidación: `sessionVersion` por usuario (al desactivar la cuenta o cambiar roles).
- **Limitación conocida:** las versiones de sesión viven **en memoria**; en despliegues multi-instancia la invalidación no se propaga. Antes de escalar horizontalmente hay que moverlas a Redis o a una tabla `user_sessions` en PostgreSQL **(por aprobar)**.

## 3. Límites de solicitudes
Por IP, configurables por entorno (`express-rate-limit`, respuesta `429 TOO_MANY_REQUESTS`):

| Ámbito | Variables | Valor por defecto |
|---|---|---|
| `POST /auth/login` | `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX` | 10 intentos / 15 min **(por aprobar)** |
| Toda la API | `API_RATE_LIMIT_WINDOW_MS` / `API_RATE_LIMIT_MAX` | 300 / min **(por aprobar)** |

Límites existentes: JSON `1mb`. Cuando se implementen `files` (FR-004) e IA (FR-013) deberán añadir su propio límite.
Detrás de un proxy, `TRUST_PROXY=1` para que el límite use la IP real.

## 4. Comunicaciones
- Producción: redirección HTTP→HTTPS (308) y HSTS (`max-age` 2 años, `includeSubDomains`, `preload`) en `app.ts`.
- Debe verificarse en el despliegue: TLS hacia PostgreSQL, almacenamiento y proveedor de IA.
- CORS (`CORS_ORIGIN`) restringe orígenes del navegador pero **no sustituye** la autenticación ni la autorización.

## 5. Datos persistentes y claves (infraestructura, por definir)
- Cifrado en reposo: usar el del proveedor de PostgreSQL gestionado (o `pgcrypto` por columna si se requiere) y respaldos cifrados.
- La cuenta de aplicación de PostgreSQL debe tener permisos mínimos (en `audit_log` solo `INSERT`/`SELECT`).
- Secretos solo en variables de entorno/bóveda; valores distintos por entorno; `process.env` solo se lee en `config/env.ts` (impuesto por `architecture.test.ts`).
- Credencial comprometida: generar una nueva, desplegarla, revocar la anterior; rotar `JWT_SECRET` invalida todas las sesiones.

## 6. Entradas, errores y logs
- Zod `.strict()` en todos los esquemas; consultas SQL parametrizadas; sin `v-html` en el frontend.
- Errores inesperados: el cliente recibe solo `INTERNAL_ERROR` + `requestId`; el log del servidor usa `safeErrorLog` (nombre, mensaje, código y stack, sin parámetros).
- `recordAudit` redacta automáticamente claves sensibles (`password`, `token`, `secret`, `authorization`, `cookie`, `apiKey`, `hash`) en `metadata`.
- Retención de logs y respaldos: **(por aprobar)**.

## 7. IA
- `knowledge_documents.ai_authorized` está forzado a `FALSE`. Al implementar FR-013 se definirá el procedimiento para levantarlo (quién autoriza, auditoría, revocación) y el contexto enviado se filtrará por autorización y permisos.

## 8. Pendientes fuera de código
- Reemplazar `@usuarioN` en `.github/CODEOWNERS` por usuarios reales.
- Evidencia de QA y `npm audit` (Edgar Alan Meráz Casas).
