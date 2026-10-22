# FR-008 — Seguimiento de estado, progreso y plazos de tickets

Estado: implementado sobre el flujo existente de `tickets` (FR-003/005/007/018). Las reglas marcadas **(por aprobar)** son propuestas, no un catálogo aprobado por el negocio.

## Flujo de estados (por aprobar)

`Open → Assigned → In Progress → Resolved → Closed`, con reapertura `Resolved → In Progress`. `Closed` es terminal.

| Origen | Destino | Rol / permiso | Endpoint | Condición |
|---|---|---|---|---|
| Open | Assigned | Service Advisor (`tickets:assign`) | `PATCH /tickets/:id/assignment` (FR-007) | técnico activo |
| Assigned | In Progress | técnico asignado o staff con `tickets:status:update` | `PATCH /tickets/:id/status` | — |
| In Progress | Resolved | `tickets:resolve` (técnico asignado o staff) | `POST /tickets/:id/resolution` | resolución obligatoria |
| Resolved | In Progress | `tickets:status:update` | `PATCH /tickets/:id/status` | reapertura |
| Resolved | Closed | `tickets:close` (Advisor, Manager) | `POST /tickets/:id/close` | — |

La matriz vive en un único lugar: [tickets.deadline.ts](../apps/api/src/modules/tickets/tickets.deadline.ts) (`TRANSITIONS`). Las transiciones de resolución y cierre no pueden hacerse por `PATCH /status`.

## Plazo (por aprobar)

- Campo `dueDate` (instante UTC, `TIMESTAMPTZ`); el frontend lo convierte a la hora local del navegador. Pendiente definir zona horaria de negocio, días hábiles y si se calcula por prioridad (**no** se calcula: FR-006 no tiene regla aprobada).
- Puede quedar sin definir: se muestra "Sin plazo definido" y **nunca** cuenta como vencido.
- Solo `tickets:deadline:update` (Service Advisor) lo establece, modifica o elimina; **motivo obligatorio**, fecha futura, ticket no cerrado.
- Vencido = `dueDate` pasada **y** estado distinto de `Resolved`/`Closed`. Se calcula al consultar (listado y detalle usan la misma función `isOverdue`); no es un estado del flujo. Una reapertura vuelve a contarlo.
- Enviar el mismo plazo no genera evento ni incrementa la versión.

## Progreso

Estado actual + **notas de avance** con autor y fecha (sin porcentajes). Las notas son internas: solo las ve quien puede leer el historial interno (staff y técnico asignado); el empleado solo recibe los cambios de estado públicos (`publicUpdates` ya excluye acciones desconocidas). La documentación detallada de resolución llegará con FR-009.

## API

| Operación | Ruta | Permiso |
|---|---|---|
| Estado, plazo y `isOverdue` | `GET /tickets/:id` | acceso al ticket |
| Transiciones disponibles | `GET /tickets/:id/available-transitions` | acceso al ticket (lista vacía sin permisos) |
| Cambiar estado | `PATCH /tickets/:id/status` `{ status, expectedVersion? }` | `tickets:status:update` |
| Establecer plazo | `PATCH /tickets/:id/deadline` `{ dueDate\|null, expectedVersion, reason }` | `tickets:deadline:update` |
| Registrar avance | `POST /tickets/:id/progress-updates` `{ note }` | `tickets:progress:create` |
| Historial | `GET /tickets/:id/history` | según visibilidad |
| Filtros | `GET /tickets?status=&overdue=true\|false` | dentro del alcance del usuario |

Sin sesión: `401`; sin permiso: `403`; versión desactualizada: `409`; transición inválida: `409`/`400`.

Permisos nuevos: `tickets:deadline:update` (Service Advisor) y `tickets:progress:create` (Technician, Service Advisor).

## Consistencia

- Plazo y estado se guardan junto con su evento de historial en una transacción (`saveWithHistory`, con versión optimista). Las notas de avance son solo historial (`addHistory`) y no cambian la versión del ticket.
- Cambiar estado o plazo no altera categoría, prioridad ni técnico.
- No se requirió migración: `due_date`, `ticket_history.reason` y `version` ya existían.

## Frontend

- [TicketTrackingPanel.vue](../apps/web/src/components/TicketTrackingPanel.vue) en el detalle: estado, plazo, selector de transiciones permitidas, edición de plazo con motivo y notas de avance; se recarga el ticket solo tras confirmar el guardado.
- Historial con descripciones de plazo y avances; insignia "Vencido" en detalle y listado; filtros por estado y vencimiento en `TicketsView`.
- Un empleado ve solo la información pública de seguimiento (sin plazo ni notas internas).

## Pruebas

`apps/api/src/modules/tickets/tickets.deadline.test.ts` (Jest + Supertest): cálculo de vencimiento, permisos, validaciones, historial atómico, notas ocultas al empleado, transiciones inválidas, conflicto de versión y tickets cerrados. Pendiente: prueba Cypress y validación QA.

## Decisiones pendientes

Estados oficiales y reaperturas, quién cambia el plazo (hoy solo Service Advisor), días hábiles/zona horaria, si el motivo del cambio de estado es obligatorio, relación prioridad-plazo (FR-006) y si el empleado debe ver el plazo.
