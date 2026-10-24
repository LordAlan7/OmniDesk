# Trazabilidad y auditabilidad (NFR-009)

Permite reconstruir **quién** hizo **qué**, sobre **qué recurso**, **cuándo** y **qué cambió**. Los valores marcados **(por aprobar)** son decisiones pendientes de la política de auditoría.

## Registros

| Registro | Uso | Estado |
|---|---|---|
| `ticket_history` | Evolución del ticket (línea de tiempo). Visible, filtrado, para el solicitante. | Implementado |
| `audit_log` | Acciones auditables transversales (consulta administrativa). | Implementado |
| `AIInteraction` / `AIValidation` | Interacción de IA y decisión humana. | **Pendiente (FR-013/FR-015)**: solo hay eventos reservados en el catálogo, sin tablas ni código. |

Los logs técnicos (`console.error`) **no** sustituyen estos registros de negocio.

## Campos

Cada evento de `audit_log`: `id`, `action` (del catálogo), `entity` + `entity_id` (recurso), `actor_id`, `outcome`, `correlation_id`, `metadata` (valores anterior `from` / nuevo `to` y `reason`) y `created_at`. El actor y la fecha los fija el servidor (identidad del token y reloj de la base), nunca el cliente. `ticket_history` guarda los mismos datos del cambio más `correlation_id`.

- **Correlación:** el identificador de la petición (`X-Request-Id`) se propaga con `AsyncLocalStorage` y se guarda en historial y auditoría; una asignación que además cambia el estado deja dos eventos con la misma correlación.
- **Resultado:** `applied` (cambio confirmado) o `rejected` (intento fallido, p. ej. `auth.login_failed`). Un intento fallido nunca aparece como cambio realizado. Las acciones rechazadas por validación o permisos (400/403) **no** generan evento de auditoría (hoy solo se audita el login fallido).
- **Sin secretos:** `metadata` pasa por `redactSensitive` (NFR-002). Las notas de avance (texto libre) viven solo en `ticket_history`; la auditoría solo indica que ocurrieron.

## Catálogo de eventos

Fuente única: [audit.catalog.ts](../apps/api/src/modules/audit/audit.catalog.ts) (`GET /audit-logs/catalog`). Cada evento declara entidad, módulo, resultado y, para tickets, su acción gemela en `ticket_history`.

| Módulo | Eventos |
|---|---|
| auth | `auth.login`, `auth.login_failed` (rejected), `auth.logout` |
| users | `user.created`, `user.updated` |
| tickets | `ticket.created`, `.updated`, `.status_changed`, `.assigned`, `.priority_changed`, `.category_changed`, `.business_info_updated`, `.deadline_changed`, `.progress_update` |
| files | `ticket.attachment_uploaded` |
| knowledge | `knowledge.created/updated/draft/approved/retired`, `document.created`, `document.metadata.updated`, `document.publication.updated` |
| ai (reservados) | `ai.suggestion_generated`, `.reviewed`, `.approved`, `.rejected`, `.applied`, `ai.request_failed` |

**Cobertura verificada por prueba:** `audit.catalog.test.ts` falla si el código registra una acción fuera del catálogo, si una acción de `ticket_history` no está mapeada (o declarada solo-historial) o si un evento marcado `implemented` no se produce en ningún lugar.

## Atomicidad

- **Tickets (creación, estado, asignación, prioridad, categoría, información comercial, plazo, avances):** el repositorio inserta el evento de historial **y** el de auditoría dentro de la misma transacción que el cambio. Si la auditoría falla, se hace `ROLLBACK` y no queda un cambio confirmado sin auditoría (probado con repositorio simulado).
- **Documentos (FR-012):** ya compartían transacción (`recordDocumentAudit`).
- **Mejor esfuerzo (limitación conocida):** `auth.*`, `user.*`, `knowledge.*` y `ticket.attachment_uploaded` se registran *después* del cambio con `recordAudit`; si la escritura de auditoría falla se informa en el log del servidor y el cambio permanece. Pendiente moverlos a la transacción de su repositorio.
- **Reintentos:** la creación de tickets es idempotente por `Idempotency-Key`; el resto de operaciones rechaza reintentos con versión desactualizada (409) o transición inválida, por lo que un reintento no duplica el evento. Enviar el mismo estado/plazo no genera evento.

## Protección frente a alteraciones

- La API solo expone `GET` sobre auditoría; no hay rutas de edición ni borrado (probado: PATCH/PUT/DELETE/POST → 404).
- La migración `009_audit_traceability.sql` añade triggers que rechazan `UPDATE`, `DELETE` y `TRUNCATE` sobre `audit_log` y `ticket_history`. Única excepción: la FK `audit_log.actor_id ON DELETE SET NULL` puede anular el actor, sin tocar otros campos, para conservar la traza si se elimina una cuenta. En `ticket_history` el autor no puede borrarse mientras exista historial.
- Verificado contra PostgreSQL (PGlite): idempotencia de la migración, bloqueo de UPDATE/DELETE/TRUNCATE y comportamiento de la FK. La prueba `audit.postgres.integration.test.ts` repite esas comprobaciones contra PostgreSQL real con `TEST_DATABASE_URL` (base `omnidesk_test`); **no se ha ejecutado aún**.
- **Lo que NO se afirma:** no es almacenamiento inmutable ni hay detección criptográfica de alteraciones (hash encadenado / firma / WORM). Un superusuario o propietario de la tabla puede desactivar los triggers.
- **Recomendado en despliegue:** la cuenta de la aplicación solo con `INSERT, SELECT` sobre `audit_log` y `ticket_history`; la administración de la base con otra cuenta, y respaldos fuera de la base. Evaluar hash encadenado si la política lo exige **(por aprobar)**.

## Consulta

- **Línea de tiempo del ticket:** `GET /tickets/:id/history`. Personal con permiso de historial (y el técnico asignado): eventos completos con autor (`actorName`) y correlación. Solicitante: solo `created` y cambios de estado, sin autor, motivos, notas ni correlación (FR-018).
- **Auditoría:** `GET /audit-logs` (permiso `audit:read`: Manager y Administrator) con filtros `entity`, `entityId`, `action`, `actorId`, `outcome`, `correlationId`, `from`, `to` y paginación (`page`, `limit` ≤ 100); `GET /audit-logs/:id` y `GET /audit-logs/catalog`. Vista web en `/audit`.
- Las fechas se guardan en UTC (`TIMESTAMPTZ`, ISO con `Z`) y la interfaz las muestra en la zona del navegador con la zona identificable (p. ej. `GMT-6`).

## Conservación (por aprobar)

No hay política aprobada. Hoy los registros se conservan indefinidamente y ninguna ruta los elimina. Cualquier depuración autorizada deberá hacerse fuera de la aplicación con una cuenta administrativa que desactive temporalmente el trigger, quedando documentada (quién, cuándo, rango y motivo) como un evento propio. Decidir: plazo de conservación, acceso a respaldos y qué ocurre con registros de cuentas eliminadas.

## IA (pendiente)

Cuando FR-013/FR-015 existan deberán registrar en `AIInteraction` (propuesta + contexto/versión conservada + fuentes, sin claves ni contexto innecesario) y en `AIValidation` (revisión, aprobación o rechazo humano), y aplicar la propuesta solo mediante un evento `ai.suggestion_applied` distinto de la generación. Los eventos ya están reservados en el catálogo; AIR-007 mantiene el vínculo detallado con las fuentes.

## Decisiones pendientes

Catálogo definitivo, plazo de conservación, quién accede a los respaldos, detalle de contenido sensible visible en auditoría, hash encadenado/almacenamiento inmutable, auditar también los intentos rechazados por permisos, y mover los eventos de mejor esfuerzo a su transacción.
