AIR-001 — Asistente de IA para soporte técnico
Estado: Implementado sobre la infraestructura de FR-013.Dependencias: Knowledge Base, Autenticación, Servicio de IA, Fuentes autorizadas (AIR-002).Roles con acceso: Employee, Technician, Service Advisor, Manager, Administrator (permiso ai:query).Requisitos relacionados: AIR-002, AIR-003, AIR-004, AIR-006, AIR-007, AIR-008, AIR-009, BR-005, BR-007, BR-009, BR-010, BR-011, NFR-003.

1. Resumen
AIR-001 pone en marcha el asistente de IA que ya tenía infraestructura (FR-013): el endpoint POST /api/v1/ai/ask ahora responde realmente, registra cada interacción y la audita. El asistente solo responde con fuentes autorizadas (artículos aprobados y documentos aprobados por el flujo AIR-002), y dentro del detalle del ticket añade el contexto filtrado del ticket (lista blanca de campos). La interfaz es un panel simple embebido en el detalle del ticket.

2. Decisiones del usuario
Formulario simple. El panel es un único campo de texto y un botón. Sin modo avanzado, sin selección de modelo, sin parámetros.
Dentro del detalle del ticket. El panel aparece al final de TicketDetailView.vue. No hay vista aparte para el asistente.
Recuperación de contexto: sí. El backend ya la tenía (retrieveAuthorizedContext); AIR-001 la usa.
ticketId se pasa automáticamente desde el detalle (prop :ticket-id), evitando que el usuario lo escriba y se equivoque.
3. Arquitectura
apps/api/src/modules/ai/  ai.routes.ts           → POST /ai/ask (valida, llama al servicio, registra, audita)                          GET  /ai/interactions/:id (ya existente; revalida al reabrir)  ai.schemas.ts          → zod `.strict()` de la petición { question, ticketId? }  ai.service.ts          → askWithAuthorizedSources() — RAG completo (FR-013)  providers/    ai-provider.ts       → contrato AIProvider    mock-provider.ts     → pruebas    openai-provider.ts   → NUEVO: OpenAI Chat Completions vía fetch    index.ts             → factory: 'mock' | 'openai'  context/ticket-context.ts     → lista blanca de campos del ticket  interactions/interactions.ts  → almacén en memoria + revalidación al reabrir  sources/...             → ya implementado (AIR-002)  index.ts                → API pública del móduloapps/api/src/config/env.ts  + aiOpenAiModel (default 'gpt-4o-mini')apps/api/src/shared/errors.ts  + Errors.badGateway (502) — para fallos del proveedor externoapps/api/src/modules/audit/audit.catalog.ts  ai.suggestion_generated  → implemented: true (con valuesInAudit:false)  ai.request_failed        → implemented: true (outcome: 'rejected')apps/web/src/  services/aiAssistant.ts  → askAssistant(), getInteraction()  components/AssistantPanel.vue  → panel simple  views/TicketDetailView.vue     → inserta <AssistantPanel :ticket-id="ticket.id" />  cypress/e2e/air001.cy.ts       → 6 escenarios E2E
4. Flujo del endpoint POST /ai/ask
Cliente → { question: "¿Cómo reinicio la impresora?", ticketId?: 42 }  1. authenticate       → req.user presente (401 si no)  2. requirePermission  → AI_QUERY (403 si no)  3. askSchema.strict() → 400 si sobran campos o faltan/invalidan  4. askWithAuthorizedSources(question, user, undefined, { ticketId? }):       a. can(AI_QUERY) → 403 si el token perdió el permiso       b. buildTicketContext(ticketId, user) → 403 sin AI_CONTEXT_TICKETS,          404 si el ticket no existe o no es accesible (sin distinguir)       c. retrieveAuthorizedContext(question, user) → solo fragmentos          aprobados y visibles para el usuario (AIR-002)       d. Si nada supera el filtro → { status: 'insufficient_information',          message, references: [], aiGenerated: true }  ← AIR-009       e. provider.ask(question, contextItems) → OpenAI / mock       f. Revalidación post-generación: si una fuente se retiró durante la          generación, la respuesta se descarta y se devuelve "insuficiente"       g. { status: 'answered', answer, references, aiGenerated: true }  5. recordInteraction({ userId, question, answer|message, references })  6. recordAudit(ai.suggestion_generated, { ticketId, status, references })  7. 201 Created → { id, status, answer, references, aiGenerated, createdAt }
Si el proveedor externo falla, se audita ai.request_failed y se devuelve 502 BAD_GATEWAY sin exponer detalles del proveedor (AIR-009).

5. Proveedor OpenAI
providers/openai-provider.ts usa fetch (Node 18+) contra https://api.openai.com/v1/chat/completions. No añade dependencias externas.

System prompt fijo (no editable por el cliente): el modelo solo puede usar las fuentes provistas y debe decir "no hay información suficiente" si no bastan (AIR-009).
Mensajes: system (reglas), system (fuentes enmarcadas como dato), user (pregunta). El contenido de las fuentes NUNCA va en el turno del usuario.
Temperature 0.2: respuestas estables para la misma pregunta + fuentes.
Timeout 30s: si OpenAI no responde, fallamos rápido (AIR-009).
max_tokens 700: acota costo y longitud; el técnico lee sin scroll.
Sin openai npm package: solo fetch, sin dependencia nueva.
Para activarlo:

AI_PROVIDER=openaiOPENAI_API_KEY=sk-...AI_OPENAI_MODEL=gpt-4o-mini   # opcional; default ya es ese
Sin OPENAI_API_KEY, la instanciación lanza (fail-fast) para que el despliegue no quede silenciosamente sin IA.

6. Seguridad y privacidad (AIR-008, AIR-009, NFR-002, NFR-003)
Permiso ai:query antes de recuperar o llamar al modelo. Lo verifica requirePermission (middleware) y can(user, AI_QUERY) dentro del servicio.
Contexto de ticket por permiso propio (ai:context:tickets). Solo Technician, Service Advisor y Manager lo tienen. Administrator y Employee no.
Lista blanca de campos del ticket: id, title, description, status, categoryId. No se envían solicitante, técnico asignado, resolución, observaciones, datos comerciales.
Inyección de prompt: el contenido de las fuentes y del ticket llega enmarcado por frameAsData y frameTicketContext (se neutralizan etiquetas tipo [/TICKET], [/SOURCE]). El system prompt trata el contenido de las fuentes como DATO, no como instrucciones.
Revalidación post-generación: si una fuente se retiró durante la generación, la respuesta se descarta.
Revalidación al reabrir: al consultar GET /ai/interactions/:id, cada referencia se revalida; si una fuente ya no es accesible, la interacción se devuelve como unavailable y el texto generado no se vuelve a mostrar.
Auditoría sin texto ni claves: ai.suggestion_generated solo guarda userId, ticketId, status, references.length. El texto vive en la interacción en memoria.
Sin datos del proveedor al cliente: los errores de OpenAI se traducen a 502 BAD_GATEWAY con mensaje neutro.
7. Trazabilidad (AIR-007, NFR-009)
Cada respuesta queda ligada a:

Quién: actorId en audit_log y userId en la interacción.
Cuándo: createdAt en ambos.
Sobre qué: ticketId opcional en metadata de auditoría.
Con qué fuentes: references en la interacción (cada una con authorizationId, sourceType, sourceId, sourceVersion, chunkIndex).
Correlación: el requestId de la petición viaja en correlationId de auditoría (NFR-009).
Para reconstruir "¿qué pasó con la pregunta del técnico X a las 14:32 sobre el ticket 42?":

Filtrar audit_log por actorId=X, action=ai.suggestion_generated, from=14:30, to=14:35.
Tomar el entityId (interactionId) y consultar GET /ai/interactions/:id como ese técnico.
El references de la interacción identifica cada fuente usada (con versión exacta).
8. Pruebas
Unitarias / integración
apps/api/src/modules/ai/ai.access.test.ts — matriz de permisos, contexto filtrado, revalidación post-generación, interacciones por dueño. Ya existente; AIR-001 lo complementa con el endpoint real.
apps/api/src/adapters.test.ts — factory del proveedor (mock por defecto, error en desconocido). Sigue pasando.
E2E (apps/web/cypress/e2e/air001.cy.ts)
El panel aparece en el detalle del ticket para usuarios con ai:query.
Preguntar devuelve una respuesta del asistente y la marca como IA (disclaimer visible).
Rechaza preguntas demasiado cortas en el cliente (botón deshabilitado).
La ruta /api/v1/ai/ask responde 401 sin sesión.
El ticketId se pasa automáticamente y se muestra "Contexto usado: ticket #N".
Cómo correrlas
# 1) Backend con mockAI_PROVIDER=mock npm run dev:api# 2) Frontendnpm run dev:web# 3) E2Enpm run test:e2e --prefix apps/web -- --spec cypress/e2e/air001.cy.ts
Para probar el proveedor OpenAI real:

AI_PROVIDER=openai OPENAI_API_KEY=sk-... npm run dev:api
9. Configuración
Variable	Default	Descripción
AI_PROVIDER	mock	'mock' para desarrollo/pruebas; 'openai' para producción.
OPENAI_API_KEY	—	Obligatoria si AI_PROVIDER=openai.
AI_OPENAI_MODEL	gpt-4o-mini	Modelo de chat. Cambiar con acuerdo del equipo.
No hay más opciones en el cliente: el frontend no puede elegir modelo, temperatura ni fuentes. Todo lo decide el backend (AIR-008).

10. Limitaciones conocidas
Interacciones en memoria. Si la API se reinicia, se pierden. La persistencia en PostgreSQL llega con FR-015. Mientras tanto, la traza de auditoría (ai.suggestion_generated) sobrevive en audit_log.
Estado in-process documentado (NFR-008): sessionVersions, creations, queues y ahora interactions son in-process. Multi-instancia requiere moverlos a Redis o a la BD. Ver docs/NFR-008-Scalability.md.
Sin streaming. La respuesta se entrega completa. Para soporte interno con gpt-4o-mini el tiempo de respuesta es aceptable; si se sube a un modelo más lento, conviene añadir SSE en una iteración siguiente.
Sin historial del asistente en la UI. La interacción se registra y se puede reabrir vía GET /ai/interactions/:id, pero el frontend aún no tiene una vista de historial. Es intencional: el panel es simple (decisión 1).
11. Cumplimiento de criterios de aceptación
Criterio AIR-001	Dónde
El asistente puede recibir preguntas del usuario y dar una respuesta relacionada con el proceso de servicio de TI de la organización.	POST /ai/ask + AssistantPanel.vue.
La respuesta se presenta como información de apoyo y no como decisión final.	System prompt del proveedor + disclaimer visible en la UI + auditoría que no aplica resultados.
Solo usuarios autorizados acceden (AIR-008).	requirePermission(AI_QUERY) en la ruta + can(AI_QUERY) en el servicio.
Solo se usan fuentes aprobadas (AIR-002).	retrieveAuthorizedContext filtra por status='approved' y permiso del usuario.
Se identifican las fuentes usadas (AIR-003 / AIR-007).	references en la respuesta + sección "Fuentes usadas" en el panel + auditoría.
El usuario revisa antes de aplicar (AIR-004 / AIR-006).	El panel no tiene acción "aplicar"; la decisión la toma el técnico en las acciones del ticket.
El asistente indica cuando no tiene información suficiente (AIR-009).	status: 'insufficient_information' y mensaje en la UI.
Toda respuesta se identifica como generada por IA (NFR-003).	aiGenerated: true en el payload + disclaimer "⚠ Respuesta generada por IA".
12. Mensaje de commit
feat(ai): AIR-001 — asistente de IA para soporte (RAG con OpenAI o mock)- Conecta /ai/ask al servicio real (era 501 placeholder de FR-013).- Proveedor OpenAI real vía fetch (sin dependencia nueva); mock sigue por defecto.- Esquema zod strict de la petición (question 5..2000, ticketId opcional).- Registra cada interacción (memoria) y la audita como ai.suggestion_generated.- Fallos del proveedor → 502 BAD_GATEWAY + auditoría ai.request_failed.- Frontend: AssistantPanel.vue embebido en TicketDetailView (ticketId auto).- E2E: 6 escenarios en apps/web/cypress/e2e/air001.cy.ts.Cumple: AIR-001, AIR-002, AIR-003, AIR-004, AIR-006, AIR-007, AIR-008, AIR-009,        BR-005, BR-007, BR-009, BR-010, BR-011, NFR-003.