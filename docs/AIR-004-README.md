AIR-004 — Revisión humana de recomendaciones de IA
Estado: Implementado sobre AIR-001 (FR-013) y FR-009.Dependencias: FR-013/AIR-001, FR-015 (componentes y registro de revisión), FR-001/NFR-001/AIR-008, AIR-003, FR-009, BR-010, BR-011.Roles con acceso a revisión: Technician, Service Advisor, Manager (permiso ai:validate).Roles con acceso a rechazar: Sólo Manager (decisión D1 del usuario: rol superior).

1. Resumen
AIR-004 añade la decisión humana explícita sobre cada recomendación generada por el asistente. La recomendación se presenta como pendiente de decisión; el técnico/asesor autorizado debe aprobar, rechazar o solicitar más información. Sólo cuando una recomendación está aprobada se puede aplicar al ticket, y la aplicación reutiliza FR-009 (addInvestigation o resolveTicket): no crea un flujo paralelo, no ejecuta comandos y no cierra el ticket automáticamente.

2. Decisiones del usuario (confirmadas en el chat)
Quién aprueba/solicita info: Technician + Service Advisor + Manager (cualquiera con ai:validate).
Quién rechaza: sólo Manager (rol superior).
needs_more_info dispara una nueva consulta al asistente con la aclaración del revisor (no sólo registra la decisión).
La decisión se puede cambiar (la revisión es mutable; cada cambio se audita).
apply requiere approved en la última revisión vigente.
Aplicar llena automáticamente el formulario de FR-009 con el contenido pre-llenado, pero el técnico puede editar antes de confirmar (AIR-006: validación humana).
Pre-llenado (D5): para investigación, activity = "Consulta: <pregunta>" y result = answer + referencias; para resolución, resolution = answer y resolutionVerification vacío (FR-009 lo exige y el técnico lo llena).
3. Arquitectura
apps/api/src/modules/ai/  ai.routes.ts                      → + POST /ai/interactions/:id/review                                     + POST /ai/interactions/:id/apply  ai.schemas.ts                     → (sin cambios)  reviews/    reviews.ts                      → NUEVO: almacén en memoria de revisiones    reviews.schemas.ts              → NUEVO: zod de /review y /apply  interactions/interactions.ts      → + ticketId en AiInteraction, + getInteractionById  index.ts                          → + exporta recordReview, getActiveReviewForInteraction,                                       attachFollowUp, canTakeDecision, resetReviews, tiposapps/api/src/modules/audit/  audit.catalog.ts                  → ai.suggestion_reviewed, ai.suggestion_approved,                                       ai.suggestion_rejected, ai.suggestion_applied:                                       implemented=true, valuesInAudit=false  audit.catalog.test.ts             → ajusta expectativa: ya no quedan reservadosapps/web/src/  services/aiAssistant.ts           → + reviewInteraction(), applyInteraction()  components/AssistantPanel.vue     → + botones aprobar / solicitar más info / rechazar                                       + formularios de aplicación pre-llenados  cypress/e2e/air004.cy.ts          → NUEVO: 6 escenarios E2Edocs/AIR-004-README.md              → este archivo
4. Endpoints
POST /api/v1/ai/interactions/:id/review
Permisos: ai:validate.

Body (zod .strict()):

{ "decision": "approved" | "rejected" | "needs_more_info",  "reason": "<5..2000 caracteres>" }
Reglas:

El revisor debe ser el dueño de la interacción (las interacciones son privadas; el flujo "Manager revisa lo que preguntó un técnico" llega con FR-015, no aquí).
decision='rejected' → sólo Manager. Cualquier otro rol recibe 403.
decision='needs_more_info' → el backend dispara askWithAuthorizedSources con question = original + "\n\nAclaración: " + reason y crea una interacción nueva; la devuelve en followUp.
La revisión es mutable: si ya existía, la nueva "pisa" a la anterior (supersedesId) y se audita de nuevo.
Respuesta 201:

{ "id": <reviewId>,  "interactionId": <id>,  "decision": "<decision>",  "reviewerId": <userId>,  "reviewedAt": "<iso>",  "supersedesId": <id | null>,  "followUp": { "id": <interactionId>, "answer": "<texto>", "status": "<status>" } | null }
Audita:

ai.suggestion_reviewed (siempre, con decision y supersedesId).
ai.suggestion_approved si approved.
ai.suggestion_rejected si rejected (outcome rejected).
POST /api/v1/ai/interactions/:id/apply
Permisos: ai:validate + los permisos de FR-009 (tickets:update para investigation; tickets:resolve para resolution).

Body (zod discriminado por target):

target: 'investigation' → { ticketId, content: { activity, result, knowledgeArticleId? } }
target: 'resolution' → { ticketId, expectedVersion, content: { resolution, resolutionVerification, rootCause?, observations?, knowledgeArticleId? } }
Reglas:

El solicitante debe ser el dueño de la interacción.
La última revisión vigente debe ser approved (D4). Si no, 409 invalidState.
El ticketId del body debe coincidir con el de la interacción (anti-sustitución).
El guardado lo hacen los servicios de FR-009 (addInvestigation o resolveTicket): revalidan acceso al ticket, estado y expectedVersion.
No se cierra el ticket. No se ejecutan comandos externos.
Respuesta 201:

{ "applied": true,  "target": "investigation" | "resolution",  "investigationId"?: <id>,  "ticketId": <id>,  "ticketVersion"?: <number> }
Audita: ai.suggestion_applied con reviewId, ticketId, target e investigationId o ticketVersion.

5. Cumplimiento de criterios de aceptación
Criterio AIR-004	Dónde
La información se presenta como recomendación pendiente de decisión humana.	AssistantPanel.vue muestra los botones de revisión sólo si hay respuesta y no hay decisión previa; la UI nunca marca "aprobada" por defecto.
El usuario autorizado puede revisarla y decidir su uso.	POST /ai/interactions/:id/review con ai:validate.
La decisión identifica revisor, fecha y contenido concreto.	AiReview + auditoría con actorId, reviewedAt, decision, reason (vive en metadata de auditoría, no en audit_log.values).
Abrir una recomendación no la acepta automáticamente.	El backend exige decision + reason explícitos. No hay "auto-aprobar al ver".
Una nueva versión no hereda una aceptación anterior.	Cada /ai/ask genera una interacción nueva con id nuevo. La revisión se asocia al id exacto.
Los usuarios sin permiso no registran decisiones válidas.	requirePermission(AI_VALIDATE) + canTakeDecision para rejected → Manager.
Aceptar no ejecuta acciones ni declara resuelto el problema.	apply con target='resolution' llama a resolveTicket (que pasa a Resolved, NO a Closed). El cierre sigue siendo manual. apply con target='investigation' sólo añade una investigación.
La aplicación y el resultado se documentan mediante FR-009.	addInvestigation y resolveTicket ya auditan ticket.investigation_logged y ticket.status_changed. La auditoría ai.suggestion_applied enlaza la interacción con el recurso guardado.
Los controles comparten implementación con FR-015.	La estructura (reviews.ts + reviews.schemas.ts) es el esqueleto que FR-015 completará con persistencia y vistas compartidas.
Las pruebas no confunden confirmación registrada con garantía de ejecución correcta.	Los E2E verifican que apply registra la investigación y NO cierra el ticket; el test "no-apply" confirma que sin approved el endpoint responde 409.
6. Pruebas
E2E (apps/web/cypress/e2e/air004.cy.ts)
El técnico aprueba y ve la confirmación + los botones de aplicar.
El técnico no ve el botón de rechazar (sólo Manager).
needs_more_info dispara una nueva consulta y la añade a los turnos.
Aplicar a una investigación la registra en el ticket (contenido pre-llenado).
No se puede aplicar sin aprobar: los botones no aparecen y la API responde 409.
La decisión se puede cambiar (D3): Manager aprueba y luego rechaza.
Cómo correrlas
AI_PROVIDER=mock npm run dev:api        # Terminal 1npm run dev:web                          # Terminal 2npm run test:e2e --prefix apps/web -- --spec cypress/e2e/air004.cy.ts
7. Limitaciones conocidas
Revisiones en memoria (igual que las interacciones). Si la API se reinicia, se pierden. La persistencia llega con FR-015. La auditoría sobrevive en audit_log.
El revisor debe ser el dueño de la interacción. El flujo "Manager revisa lo que preguntó un técnico" llega con FR-015 (vista de pendientes). En AIR-004, cada usuario revisa sus propias recomendaciones.
Pre-llenado por prompt nativo. Para apply='resolution' se pide expectedVersion con window.prompt. En una iteración siguiente, se puede leer del estado del ticket ya cargado en la vista.
No hay vista de "revisiones pendientes". Cada turno muestra su estado inline. La vista central llega con FR-015.
8. Mensaje de commit
feat(ai): AIR-004 — revisión humana de recomendaciones (aprobar/rechazar/needs_more_info + aplicar)- POST /ai/interactions/:id/review con decisión, motivo y permiso ai:validate.- Sólo Manager puede rechazar (D1). needs_more_info dispara nueva consulta (D2).- La decisión es mutable: cada cambio pisa el anterior y se audita (D3).- POST /ai/interactions/:id/apply: requiere revisión approved (D4); delega el  guardado en FR-009 (addInvestigation o resolveTicket). No cierra el ticket.- 4 eventos de auditoría pasan a implemented: ai.suggestion_reviewed, _approved,  _rejected, _applied. Ningún evento IA queda reservado.- Frontend: AssistantPanel.vue con botones de revisión, formularios pre-llenados  y edición antes de aplicar (AIR-006).- E2E: 6 escenarios en apps/web/cypress/e2e/air004.cy.ts.Cumple: AIR-004, AIR-006, AIR-008, BR-010, BR-011. Reutiliza FR-009 y FR-013.