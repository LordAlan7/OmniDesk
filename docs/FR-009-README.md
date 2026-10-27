FR-009 — Investigación, resolución y cierre de tickets
Responsables
Responsable: César Alexis Meza Martínez.
Apoyo: Alan Moreno Nevárez.
Validación QA: Edgar Alan Meráz Casas.
Objetivo
Implementar el flujo que permite a los técnicos autorizados documentarla investigación de un ticket, registrar la solución aplicada y dejarconstancia de su resolución. Posteriormente, un usuario con permiso decierre puede cerrar formalmente el ticket conforme a las condicionesaprobadas por la organización.

Resolver y cerrar son acciones distintas: resolver documenta lasolución técnica; cerrar formaliza la conclusión del proceso. Losestados concretos y las transiciones son los aprobados en FR-008.

Tecnologías
Backend: Node.js, Express y TypeScript.
Frontend: Vue y TypeScript.
Base de datos: PostgreSQL.
Pruebas del backend: Jest y Supertest.
Pruebas del frontend: Vitest (unitarias) y Cypress (E2E).
Decisiones del equipo (preguntas abiertas resueltas)
#	Decisión	Aplicación
1	El técnico que resolvió puede cerrar, a menos que se haya transferido la responsabilidad.	Technician gana tickets:close. El service verifica mustBeAssignedTechnicianOrStaff: el asignado actual cierra. Tras una reasignación, el técnico anterior pierde el acceso (404) y ya no puede cerrar.
2	No se requiere confirmación del solicitante para cerrar.	El cierre lo ejecuta el asignado actual o el staff. Sin flujo de aprobación del solicitante.
3	La comprobación del resultado es texto libre.	Campo resolutionVerification (texto libre, mínimo 5 caracteres, máximo 5000). Obligatorio al resolver.
4	Se puede reabrir un ticket resuelto si vuelven a salir problemas. El técnico decide si reabrir o crear un ticket nuevo.	reopenTicket permite Resolved → In Progress con motivo obligatorio. Conserva la resolución previa (no la borra). No se permite desde Closed.
5	Un ticket cerrado puede reabrirse a criterio del técnico, o abrir un ticket nuevo.	La decisión 4 se aplicó solo para Resolved. Para Closed, no se permite reapertura directa; el técnico decide entre crear un ticket nuevo (recomendado) o, excepcionalmente, pedir reasignación y re-resolución.
6	Botón "Proponer a base de conocimiento" como placeholder.	Se deja como placeholder visible solo en Resolved/Closed (no implementado en esta iteración; se coordinará con FR-011/BR-008).
7	La resolución es interna.	trackingTicket no expone resolution, resolutionVerification, rootCause, resolutionObservations, ni knowledgeArticleId al solicitante. El solicitante solo ve el estado (Resolved/Closed) y las fechas.
Funcionalidades implementadas
Backend
Investigaciones: tabla ticket_investigations con actividad, resultado,autor, fecha y referencia opcional a artículo de conocimiento (FR-011).
POST /tickets/:id/investigations — registra una actividad.
GET /tickets/:id/investigations — lista cronológicamente.
Solo el técnico asignado actual o el staff (tickets:read:all) ven lasinvestigaciones. El solicitante recibe [] (notas internas).
No se pueden registrar en tickets cerrados (409 INVALID_STATE).
El evento investigation_logged se registra en ticket_history yaudit_log dentro de la misma transacción (NFR-009).
Resolución ampliada: el endpoint POST /tickets/:id/resolution ahorarecibe un objeto con:
resolution (obligatorio): solución aplicada.
resolutionVerification (obligatorio): comprobación del resultado.
rootCause (opcional): causa identificada. No se obliga al técnico ainventarla.
observations (opcional): observaciones complementarias.
knowledgeArticleId (opcional): referencia a un artículo aprobado deFR-011. Se valida contra findApprovedArticleById (debe existir y estarapproved). Si no existe o no está aprobado, se rechaza con 404/400.
La ausencia de artículo NO impide resolver (FR-009 explícito).
Restricción a nivel DB: tickets_resolved_requires_verification exigeresolution_verification NOT NULL cuando status = 'Resolved' (NFR-010).
Cierre formal: el endpoint POST /tickets/:id/close ahora permite queel técnico que resolvió cierre el ticket si sigue siendo el asignadoactual. El service verifica mustBeAssignedTechnicianOrStaff.
La reasignación transfiere el cierre al nuevo responsable (el técnicoanterior pierde el acceso al ticket y recibe 404).
El staff (Service Advisor, Manager) puede cerrar cualquier ticketaccesible.
Reapertura: nuevo endpoint POST /tickets/:id/reopen con motivoobligatorio y expectedVersion.
Solo se puede reabrir un ticket en estado Resolved (no desde Closed).
La resolución previa se conserva (no se borra): queda como histórico.
El evento reopened se registra en ticket_history y audit_logcon el motivo, dentro de la misma transacción (NFR-009).
Visibilidad para el solicitante (FR-018 + decisión 7): trackingTicketya no expone resolution ni los campos ampliados. El solicitante ve elestado y las fechas, pero no el contenido de la resolución.
Trazabilidad: cada operación (investigación, resolución, cierre,reapertura) genera su evento en ticket_history y audit_log dentrode la misma transacción del cambio. Si la auditoría falla, el cambio serevierte (NFR-009).
Catálogo de auditoría: añadidos ticket.investigation_logged(valuesInAudit: false — el texto narrado vive en ticket_investigations)y ticket.reopened.
Control de concurrencia: todas las operaciones usan versionadooptimista (expectedVersion). Una versión antigua se rechaza con 409.
Frontend
Sección de Investigación en TicketDetailView.vue:
Lista cronológica con autor y fecha.
Formulario con campos activity, result (ambos obligatorios) ydropdown opcional de artículos de conocimiento aprobados (FR-011).
Solo visible para el técnico asignado actual o el staff.
Bloqueada en tickets cerrados.
Formulario de Resolución ampliado en TicketTrackingPanel.vue:
Campos resolution y resolutionVerification (obligatorios).
Campos rootCause y observations (opcionales).
Dropdown opcional de artículos de conocimiento.
Se valida antes de habilitar "Aplicar cambio".
Conserva el contenido si el guardado falla.
Formulario de Cierre formal en TicketDetailView.vue:
Visible cuando el ticket está Resolved y el usuario tienetickets:close.
Muestra la resolución completa (solución, comprobación, causa,observaciones, referencia a conocimiento) para revisión previa.
Campo opcional de comentario de cierre.
Botón "Cerrar ticket" que ejecuta el cierre.
Formulario de Reapertura en TicketTrackingPanel.vue:
Visible cuando el ticket está Resolved y el usuario tienetickets:status:update.
Motivo obligatorio (máximo 500 caracteres).
Mensaje que aclara que la resolución previa se conserva.
Visibilidad para el solicitante: el solicitante no ve las seccionesde Investigación ni de Cierre formal. En MyTicketsView.vue solo ve elestado y las fechas (decisión 7).
Historial: el evento reopened se muestra con su motivo; el eventoinvestigation_logged se muestra como "Actividad de investigaciónregistrada".
Reglas de acceso
Operación	Permisos	Verificación de recurso
Registrar investigación	tickets:update	Técnico asignado actual o staff (tickets:read:all)
Listar investigaciones	tickets:read	Técnico asignado actual o staff; el solicitante recibe []
Resolver ticket	tickets:resolve	Técnico asignado actual o staff
Cerrar ticket	tickets:close	Técnico asignado actual o staff
Reabrir ticket	tickets:status:update	Técnico asignado actual o staff
Cambios en la matriz de autorización (NFR-001):

Technician ahora tiene tickets:close (antes solo Service Advisor yManager). Se añade para permitir que el técnico que resolvió pueda cerrarsi sigue asignado (decisión 1).
No se añaden permisos nuevos para investigaciones (reutilizantickets:update) ni para reapertura (reutiliza tickets:status:update).
Cuentas de demostración
Rol	Correo	Contraseña de demostración
Employee	employee@company.com	ChangeMe123!
Technician	technician@company.com	ChangeMe123!
Service Advisor	advisor@company.com	ChangeMe123!
Manager	manager@company.com	ChangeMe123!
Administrator	admin@company.com	ChangeMe123!
Iniciar el proyecto
Abrir dos terminales desde la raíz del repositorio.

Terminal 1 — Backend
cd apps/apinpm run dev
API local:

http://localhost:3000/api/v1
Terminal 2 — Frontend
npm --prefix apps/web run dev
Direcciones habituales:

Login: http://localhost:5173/login
Listado: http://localhost:5173/tickets
Detalle: http://localhost:5173/tickets/2
Preparación de base de datos
Aplicar las migraciones en orden. FR-009 añade:

010_ticket_investigations.sql: tabla ticket_investigations y columnasampliadas en tickets (resolution_verification, root_cause,resolution_observations, knowledge_article_id).
Requiere que las migraciones previas ya estén aplicadas:

001_init.sql (tickets, ticket_history)
003_tickets_constraints.sql (version)
004_ticket_assignment.sql (ticket_history.reason)
006_knowledge_articles.sql (knowledge_articles, FK de referencia)
009_audit_traceability.sql (correlation_id, triggers append-only)
Para aplicar:

cd apps/apinpx tsx src/scripts/migrate-fr009.ts
Si no existe el script, aplica la migración directamente con psql:

psql "$DATABASE_URL" -f apps/api/db/migrations/010_ticket_investigations.sql
La migración es idempotente (todas las sentencias llevan IF NOT EXISTS).

Endpoints
Todos requieren una sesión válida y las autorizaciones correspondientes.

Método	Ruta	Función
POST	/api/v1/tickets/:id/investigations	Registrar actividad de investigación
GET	/api/v1/tickets/:id/investigations	Listar investigaciones
POST	/api/v1/tickets/:id/resolution	Resolver ticket (campos ampliados)
POST	/api/v1/tickets/:id/close	Cerrar ticket
POST	/api/v1/tickets/:id/reopen	Reabrir ticket resuelto
Ejemplo de investigación
POST /api/v1/tickets/15/investigationsAuthorization: Bearer <token>Content-Type: application/json{  "activity": "Revisé los logs del servicio de autenticación.",  "result": "Encontré errores 401 repetidos para el usuario afectado.",  "knowledgeArticleId": 3}
Respuesta (201):

{  "data": {    "id": 1,    "ticketId": 15,    "authorId": 2,    "authorName": "Demo Technician",    "activity": "Revisé los logs del servicio de autenticación.",    "result": "Encontré errores 401 repetidos para el usuario afectado.",    "knowledgeArticleId": 3,    "knowledgeArticleTitle": "Errores 401 en autenticación",    "createdAt": "2026-10-28T12:34:56.000Z"  }}
Ejemplo de resolución
POST /api/v1/tickets/15/resolutionAuthorization: Bearer <token>Content-Type: application/json{  "resolution": "Reinicié el servicio de autenticación y limpié la caché.",  "resolutionVerification": "Confirmé que el usuario pudo iniciar sesión correctamente.",  "rootCause": "Caché desactualizada del navegador.",  "observations": "Se recomienda rotación trimestral de credenciales.",  "knowledgeArticleId": 3}
Ejemplo de reapertura
POST /api/v1/tickets/15/reopenAuthorization: Bearer <token>Content-Type: application/json{  "reason": "El usuario reportó el mismo problema de nuevo.",  "expectedVersion": 4}
Respuestas relevantes
400: datos inválidos (campos obligatorios faltantes, artículo no aprobado).
401: sesión ausente o inválida.
403: operación sin permiso.
404: ticket inexistente o no visible; artículo de conocimiento inexistente.
409: conflicto de versión, estado incompatible, o intento de reaperturadesde un estado que no sea Resolved.
Visibilidad para el solicitante (FR-018 + decisión 7)
El solicitante (creador del ticket sin rol de staff) ve, víaGET /me/tickets/:id:

id, title, description, status, createdAt.
storeLocation, motorcycleModel.
resolvedAt, closedAt.
lastVisibleUpdateAt, updates (solo created y status_changed).
No ve:

resolution, resolutionVerification, rootCause,resolutionObservations, knowledgeArticleId.
Las investigaciones (la API devuelve [] para él).
Las notas de avance (FR-008).
El historial interno completo (solo ve publicUpdates).
Reapertura y resolución previa
Cuando se reabre un ticket Resolved:

El estado pasa a In Progress.
La resolución previa se conserva en tickets.resolution,resolution_verification, root_cause, resolution_observations yknowledge_article_id. No se borran.
Si el técnico vuelve a resolver, sobreescribe esos campos con la nuevaresolución.
El evento reopened queda en ticket_history con from: 'Resolved',to: 'In Progress' y el motivo.
No se permite reabrir un ticket Closed. Si el problema reaparece tras elcierre, el técnico decide entre:

Crear un ticket nuevo (recomendado, mantiene la trazabilidad del cierre).
Excepcionalmente, reabrir el ticket original (requiere que el staff loregrese a Resolved y luego el técnico lo reabra).
Archivos principales
Backend
apps/api/db/migrations/010_ticket_investigations.sql
apps/api/src/modules/audit/audit.catalog.ts (eventosticket.investigation_logged y ticket.reopened)
apps/api/src/modules/knowledge/knowledge.service.ts(findApprovedArticleById)
apps/api/src/modules/knowledge/index.ts (exportafindApprovedArticleById)
apps/api/src/modules/tickets/tickets.types.ts
apps/api/src/modules/tickets/tickets.schemas.ts(resolutionSchema, investigationSchema, reopenSchema)
apps/api/src/modules/tickets/tickets.lifecycle.ts(assertStatusInvariants, hookconfigureArticleReferenceChecker)
apps/api/src/modules/tickets/tickets.audit.ts (sin cambios; ya esgenérico y maneja los nuevos eventos)
apps/api/src/modules/tickets/tickets.repository.ts (memoria)
apps/api/src/modules/tickets/tickets.postgres.repository.ts(PostgreSQL)
apps/api/src/modules/tickets/tickets.service.ts(addInvestigation, listInvestigations, resolveTicket ampliado,closeTicket, reopenTicket)
apps/api/src/modules/tickets/tickets.routes.ts
apps/api/src/modules/tickets/tickets.tracking.ts (decisión 7: noexpone resolution)
apps/api/src/modules/tickets/index.ts
apps/api/src/shared/authorization/rolePermissions.ts(Technician gana tickets:close)
apps/api/src/app.ts (inyecta findApprovedArticleById en tickets)
Frontend
apps/web/src/services/tickets.ts
apps/web/src/components/TicketTrackingPanel.vue
apps/web/src/views/TicketDetailView.vue
Pruebas
apps/api/src/modules/tickets/tickets.test.ts (tests de FR-009)
apps/api/src/modules/tickets/tickets.deadline.test.ts (ajuste dePOST /resolution)
apps/api/src/modules/users/users.test.ts (ajuste dePOST /resolution)
apps/api/src/shared/authorization/authorization.test.ts (matrizactualizada)
apps/web/cypress/e2e/fr009.cy.ts (E2E)
Verificación
Desde la raíz del repositorio:

npm --prefix apps/api run typechecknpm --prefix apps/api test -- --runInBandnpm --prefix apps/web run type-checknpm --prefix apps/web run build-onlynpm --prefix apps/web run test:e2e -- --spec cypress/e2e/fr009.cy.ts
Pruebas realizadas
Backend (Jest + Supertest)
Investigaciones:
Técnico asignado puede registrar.
Conserva contenido, autor y fecha tras recargar.
Rechaza campos vacíos (400 VALIDATION_ERROR).
Solicitante recibe [] (decisión 7).
401 sin sesión.
No en cerrado (409 INVALID_STATE).
Resolución ampliada:
resolutionVerification obligatorio (400 si falta).
Rechaza solo-espacios (400).
Rechaza artículo inexistente (404).
403 para empleado.
Permite resolver sin artículo.
Cierre por técnico que resolvió (decisión 1):
Técnico puede cerrar si sigue asignado.
Conserva actor y fecha en auditoría.
Reasignación transfiere el cierre (decisión 1):
Técnico anterior recibe 404 tras reasignación.
Reapertura (decisiones 4 y 5):
Motivo obligatorio (400 si falta).
Versión antigua (409).
No desde estado no-Resolved (409).
Conserva resolución previa.
Queda en auditoría con ticket.reopened.
403 para empleado.
Visibilidad para solicitante (decisión 7):
Ve status y resolvedAt, no ve resolution ni campos ampliados.
No ve texto confidencial en la respuesta.
Frontend (Cypress E2E)
Flujo completo: investigar → resolver (campos ampliados) → cerrar.
Solicitante no ve resolución ni investigaciones.
Reapertura con motivo, conserva resolución previa.
Rechaza resolución sin comprobación.
No se pueden registrar investigaciones en cerrado.
Pendientes para cierre
Confirmar con el equipo los límites de longitud de los campos ampliados(5000 para resolution y resolutionVerification; 2000 para rootCausey observations).
Confirmar la política final de reapertura desde Closed (decisiones 4 y 5se aplicaron solo para Resolved; Closed queda a criterio del técnicocon creación de ticket nuevo).
Implementar el botón "Proponer a base de conocimiento" (placeholdervisible, sin endpoint — coordinar con FR-011/BR-008).
Validación final de QA en el entorno integrado (PostgreSQL + frontend +backend).
Confirmar si el cierre debe exigir un motivo obligatorio según la políticade la organización (hoy es opcional, decisión 2).
Dependencias
FR-003 — Gestión y creación de tickets (vista de detalle).
FR-001 / NFR-001 — Autenticación y control de acceso.
FR-007 — Asignación de técnicos (responsable actual).
FR-008 — Estado y seguimiento (matriz de transiciones).
FR-011 — Base de conocimiento (referencias a artículos aprobados).
FR-018 — Seguimiento del solicitante (visibilidad pública).
NFR-009 — Trazabilidad y auditabilidad (eventos en audit_log).
NFR-010 — Integridad de datos (restricciones condicionales en DB).
Coordinación con otros requerimientos
BR-008: una solución útil puede incorporarse a la base de conocimiento,pero no ocurre automáticamente al cerrar. Se coordina con FR-011 medianteel flujo autorizado (botón placeholder, pendiente de implementación).
NFR-010: las restricciones tickets_resolved_requires_resolution ytickets_resolved_requires_verification garantizan la consistencia anivel DB.
FR-004: las evidencias (adjuntos) se reutilizan; no se duplican. Lasinvestigaciones pueden referenciar adjuntos existentes.
FR-015: si se utiliza una sugerencia de IA al documentar lainvestigación o resolución, debe aplicarse la revisión humana antes deguardarla como definitiva (pendiente de implementación del módulo AI).
FR-020: se notifica al solicitante cuando se registra unainvestigación (notificación interna ticket.investigation_logged), perono se bloquea la implementación por las notificaciones.
Estado
Implementación funcional disponible para revisión.FR-009 permanece pendiente de cierre formal de reglas y QA.