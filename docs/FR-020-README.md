FR-020 — Actualizaciones y notificaciones de tickets
Responsables
Responsable: Mariana Nuñez de la Hoya.
Apoyo: César Alexis Meza Martínez.
Validación QA: Edgar Alan Meráz Casas.
Objetivo
Implementar notificaciones internas para informar a los usuariosautorizados cuando se confirme un cambio relevante en un ticket:asignación, reasignación, prioridad, estado, resolución, cierre oreapertura.

La notificación informa de un evento; el detalle del ticket siguesiendo la fuente de su situación actual. El historial de NFR-009 ylas notificaciones cumplen funciones distintas y se conservan porseparado.

Tecnologías
Backend: Node.js, Express y TypeScript.
Frontend: Vue y TypeScript.
Base de datos: PostgreSQL.
Pruebas del backend: Jest y Supertest.
Pruebas del frontend: Cypress.
Decisiones del equipo (preguntas abiertas resueltas)
#	Decisión	Aplicación
1	No se notifica al actor que ejecutó la acción.	El catálogo excluye al actor.id de los destinatarios.
2	No se notifica al técnico anterior tras una reasignación.	El catálogo excluye previousAssigneeId en el evento assigned.
3	Se revalida el acceso al ticket al consultar notificaciones.	listForUser y unreadCountForUser filtran por accessibleTicketIds. Si el destinatario perdió acceso, la notificación se oculta (no se borra).
4	Abrir una notificación la marca como leída automáticamente.	NotificationsView.openNotification llama a markNotificationRead antes de navegar.
5	Polling cada 30 segundos.	useNotificationsStore.startPolling(30000) en App.vue.
6	Mensajes breves, sin información interna.	El catálogo genera mensajes genéricos ("Se asignó un técnico a tu ticket #X"). Nunca revela la resolución, el nombre del técnico ni la prioridad.
7	Deduplicación por (userId, ticketId, eventType, correlationId).	dedup_key con UNIQUE + ON CONFLICT DO NOTHING. Dos envíos del mismo evento (misma correlationId) se ignoran; correlationId distinto se guarda.
8	Endpoints bajo /me/notifications.	Rutas: /me/notifications, /me/notifications/unread-count, /me/notifications/:id/read, /me/notifications/read-all.
Matriz de notificaciones
Evento (historyAction)	Destinatarios	Mensaje
assigned	Nuevo técnico responsable + Solicitante	"Se asignó un técnico a tu ticket #X." / "Te asignaron el ticket #X."
priority_changed	Técnico responsable + Solicitante	"Cambió la prioridad del ticket #X."
status_changed (a In Progress)	Solicitante	"El estado de tu ticket #X cambió a In Progress."
reopened	Solicitante + Técnico responsable	"Tu ticket #X fue reabierto."
investigation_logged	Solicitante	"Se registró actividad de investigación en tu ticket #X."
Eventos que NO generan notificación:

created (el creador ya sabe).
updated, category_changed, business_info_updated (ediciones administrativas).
deadline_changed (interno del staff).
closed_comment (comentario de cierre, no evento).
progress_update (nota interna, el solicitante no la ve).
Funcionalidades implementadas
Backend
Migración 011_notifications.sql: tabla notifications condedup_key UNIQUE, FKs a users y tickets con ON DELETE CASCADE,índices por usuario y por no leídas.
Catálogo notifications.catalog.ts: define, por evento, mensaje ydestinatarios. El actor siempre se excluye. El técnico anterior se excluyeen reasignación.
Service notifications.service.ts:
buildNotificationsForEvent: calcula destinatarios y mensaje.
notifyInTransaction: inserta notificaciones dentro de la tx del cambio(igual que audit_log). Si la notificación falla, el cambio se revierte.
notifyInMemory: equivalente para tests en memoria.
listForUser y unreadCountForUser: revalidan acceso vía hook inyectado.
markRead y markAllRead: marcan como leídas.
Repositorios (memoria + PostgreSQL): add con ON CONFLICT DO NOTHINGpara deduplicación, list con filtro de accessibleTicketIds,unreadCount, markRead, markAllRead.
Rutas:
GET /me/notifications (paginada, filtro ?unread=true).
GET /me/notifications/unread-count.
PATCH /me/notifications/:id/read.
PATCH /me/notifications/read-all.
Hook inyectado: configureAccessibleTicketIdsChecker en app.tsrompe el ciclo notifications → tickets → knowledge → files → tickets.
Frontend
Store useNotificationsStore: contador de no leídas, polling cada30s, listener de foco de ventana, decrementUnread para actualizacióninmediata tras marcar.
Indicador en App.vue: campana 🔔 con badge rojo que muestra elcontador (o 99+). Arranca polling al autenticarse; lo detiene al cerrarsesión.
Vista NotificationsView.vue: lista paginada, abrir notificación(marca como leída y navega al ticket), botón "Marcar como leída" pornotificación, botón "Marcar todas como leídas".
Ruta /notifications: requiere notifications:read:own.
Navegación inteligente: abre en /tickets/:id si es staff, en/my-tickets/:id si es solicitante.
Visibilidad y revalidación de acceso (decisión 3)
Cuando un usuario consulta sus notificaciones (lista o contador), elbackend:

Verifica si tiene tickets:read:all (Service Advisor, Manager).
Si NO, pide al hook accessibleTicketIdsForUser(userId) la lista deIDs de tickets a los que tiene acceso hoy.
Filtra las notificaciones: solo muestra las de tickets accesibles olas que tienen ticket_id NULL (futuras extensiones).
Si el destinatario perdió acceso a un ticket (reasignación,desactivación de cuenta), sus notificaciones de ese ticket seocultan de la lista y del contador. No se borran (NFR-009:trazabilidad), pero no se muestran.

Deduplicación (decisión 7)
dedup_key = (userId | ticketId | eventType | correlationId):

Si el mismo evento (misma correlationId) intenta notificar dos vecesal mismo usuario, ON CONFLICT DO NOTHING ignora la segunda.
Si correlationId es distinto (eventos diferentes en el tiempo), seguarda aunque sea el mismo eventType.
Esto protege contra dobles-envíos y reintentos, sin perder notificacionesde eventos legítimamente diferentes.

Cuentas de demostración
Rol	Correo	Contraseña
Employee	employee@company.com	ChangeMe123!
Technician	technician@company.com	ChangeMe123!
Service Advisor	advisor@company.com	ChangeMe123!
Manager	manager@company.com	ChangeMe123!
Administrator	admin@company.com	ChangeMe123!
Iniciar el proyecto
Backend
cd apps/apinpm run dev
Frontend
npm --prefix apps/web run dev
Preparación de base de datos
Aplicar la migración 011_notifications.sql:

psql "$DATABASE_URL" -f apps/api/db/migrations/011_notifications.sql
Requiere: 001_init.sql, 009_audit_traceability.sql (correlation_id).

Endpoints
Método	Ruta	Función
GET	/api/v1/me/notifications	Lista paginada del usuario autenticado
GET	/api/v1/me/notifications/unread-count	Contador de no leídas
PATCH	/api/v1/me/notifications/:id/read	Marca una como leída
PATCH	/api/v1/me/notifications/read-all	Marca todas como leídas
Ejemplo de respuesta (lista)
{  "data": [    {      "id": 1,      "userId": 1,      "ticketId": 15,      "eventType": "assigned",      "message": "Se asignó un técnico a tu ticket #15.",      "refEntity": "ticket",      "refId": 15,      "read": false,      "readAt": null,      "dedupKey": "1|15|assigned|req-abc123",      "correlationId": "req-abc123",      "createdAt": "2026-10-29T12:00:00.000Z"    }  ],  "meta": { "page": 1, "limit": 20, "total": 1 }}
Archivos principales
Backend
apps/api/db/migrations/011_notifications.sql
apps/api/src/modules/notifications/notifications.catalog.ts
apps/api/src/modules/notifications/notifications.types.ts
apps/api/src/modules/notifications/notifications.repository.ts
apps/api/src/modules/notifications/notifications.postgres.repository.ts
apps/api/src/modules/notifications/notifications.service.ts
apps/api/src/modules/notifications/notifications.routes.ts
apps/api/src/modules/notifications/index.ts
apps/api/src/modules/tickets/tickets.service.ts (inyecta saveContext)
apps/api/src/modules/tickets/tickets.repository.ts (llama notifyInMemory)
apps/api/src/modules/tickets/tickets.postgres.repository.ts (llama notifyInTransaction)
apps/api/src/modules/tickets/index.ts (accessibleTicketIdsForUser)
apps/api/src/app.ts (inyecta configureAccessibleTicketIdsChecker)
Frontend
apps/web/src/services/notifications.ts
apps/web/src/stores/notifications.ts
apps/web/src/views/NotificationsView.vue
apps/web/src/App.vue
apps/web/src/router/index.ts
Pruebas
apps/api/src/modules/notifications/notifications.test.ts
apps/web/cypress/e2e/notifications.cy.ts
Verificación
npm --prefix apps/api run typechecknpm --prefix apps/api test -- --runInBandnpm --prefix apps/web run type-checknpm --prefix apps/web run build-onlynpm --prefix apps/web run test:e2e -- --spec cypress/e2e/notifications.cy.ts
Pruebas realizadas
Backend (Jest + Supertest)
Asignación genera notificación al solicitante.
Asignación NO notifica al asesor actor.
Reasignación NO notifica al técnico anterior.
Resolución genera notificación al solicitante.
Reapertura genera notificación al solicitante.
Investigación genera notificación al solicitante.
Deduplicación: mismo correlationId no duplica.
Deduplicación: correlationId distinto sí guarda.
GET /me/notifications requiere sesión (401).
GET /me/notifications/unread-count devuelve el contador.
El contador coincide con las visibles no leídas.
Paginación respeta page y limit.
PATCH /me/notifications/:id/read marca como leída.
No se puede marcar notificación ajena (404).
PATCH /me/notifications/read-all marca todas.
Revalidación: notificación de ticket ajeno se oculta.
Contenido: el mensaje no revela resolución ni nombre del técnico.
Frontend (Cypress)
Solicitante recibe notificación al asignar.
Abrir notificación la marca como leída.
Marcar todas limpia el badge.
El actor no recibe notificación de su propia acción.
El contador se actualiza con polling (simulado por foco).
Pendientes para cierre
Canal externo (correo, WhatsApp, Microsoft Graph): pendiente deconfirmación según OI-002. La interfaz NotificationChannel ya existecomo placeholder; cuando se apruebe un canal, solo hay que registrarlo.
Política de conservación: cuánto tiempo se guardan las notificaciones.Hoy no hay purga automática. Queda como decisión de producto.
Reintentos de entrega externa: no implementados en esta iteración.
Tiempo real (WebSocket/SSE): hoy polling cada 30s. Si se apruebatiempo real, se cambia el mecanismo sin tocar el modelo de datos.
Validación final de QA en entorno integrado.
Dependencias
FR-006, FR-007, FR-008, FR-009 — Eventos confirmados.
FR-001 / NFR-001 — Identificar destinatarios y verificar acceso.
FR-002 — Estado de cuentas y relaciones de usuarios.
FR-018 / detalle del ticket — Destino de navegación.
NFR-009 — Trazabilidad (correlation_id).
Coordinación con otros requerimientos
NFR-009: las notificaciones se insertan en la misma transacción queel cambio del ticket y el audit_log. Si la notificación falla, elcambio se revierte (no hay cambio confirmado sin notificación).
FR-009 (decisión 7): la resolución es interna. El mensaje denotificación nunca revela el texto de la resolución, ni la causa, nilas observaciones. Solo indica "tu ticket fue resuelto".
FR-018: el solicitante navega a /my-tickets/:id desde lanotificación; el staff navega a /tickets/:id.
Estado
Implementación funcional disponible para revisión.FR-020 permanece pendiente de cierre formal de reglas y QA.


Checklist final [Status SIN PROBAR]
Aplica la migración: psql "$DATABASE_URL" -f apps/api/db/migrations/011_notifications.sql
Typecheck backend: npm --prefix apps/api run typecheck
Tests backend: npm --prefix apps/api test -- --runInBand
Typecheck frontend: npm --prefix apps/web run type-check
Build frontend: npm --prefix apps/web run build-only
E2E: npm --prefix apps/web run test:e2e -- --spec cypress/e2e/notifications.cy.ts