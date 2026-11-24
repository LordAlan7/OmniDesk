Módulo AI — contrato de componente separable (paso 8)
Asistente de IA, validación humana y cotizaciones. Desde el paso 8 el móduloestá aislado tras una frontera de puertos: no importa tickets, knowledgeni inventory por ningún medio (producción, pruebas, tipos, require,jest.mock). Quien quiera sacarlo del monolito puede hacerlo sin tocar sucódigo interno.

Frontera
Puede importar	Ejemplos
Propio módulo	./ai.ports, ./sources/..., ./providers
shared/	shared/errors, shared/types, shared/authorization, shared/http
config/env	lectura de configuración
../audit	recordAudit (módulo hoja, permitido)
Prohibido desde el paso 8	Vía de reemplazo
../tickets, ../../tickets (cualquier profundidad)	TicketsPort
../knowledge, ../../knowledge	KnowledgePort + copia de KnowledgeSourceSnapshot en sources/sources.types.ts
../inventory, ../../inventory	InventoryPort
Blindado por ai.boundary.test.ts (incluye pruebas y imports de tipo) y porarchitecture.test.ts (ai: ['audit']).

Puertos (ai.ports.ts)
El módulo consume lo exterior solo por AiPorts:

Puerto	Métodos	Sustituye a
TicketsPort	getTicketForUser, listCategories, createTicket, resolveTicket, addInvestigation	servicios de tickets
KnowledgePort	readSource(type, id, user)	snapshotArticle / snapshotDocument
InventoryPort	getVehicleByVin, getVehicleWarranty, getCompatibleProducts	InventoryProvider
La fachada perezosa (getTicketForUser, etc.) mantiene los mismos nombres quelos servicios reales: cambiar el import es el único ajuste que exigió el aislamiento.

Raíz de composición
app.ts llama configureAiPorts({...}) con los adaptadores reales delmonolito (tickets por su index.ts, snapshots de knowledge, singletongetInventoryProvider()). Si los puertos no están configurados, toda llamadafalla con AI ports not configured (fail-fast de arranque, no silencioso).

Configuración
Se queda en config/env.ts del proceso que hospede al módulo; no se mueve:

Variable	Default	Uso
AI_PROVIDER	mock	mock | openai (factoría createAIProvider)
OPENAI_API_KEY	—	obligatoria si AI_PROVIDER=openai (fail-fast)
AI_OPENAI_MODEL	gpt-4o-mini	opcional; endpoint compatible con OpenAI
Cómo extraerlo como servicio independiente
Copiar modules/ai/ completo (incluye este README y los tests de frontera).
En el nuevo proceso, implementar AiPorts con clientes HTTP que llamen a laAPI de OmniDesk (los contratos son las interfaces del puerto; los tipos derespuesta ya son vistas mínimas: AiTicketView, KnowledgeSourceSnapshot,AiInventoryVehicle/Warranty/Product).
Llamar configureAiPorts en el arranque del nuevo proceso.
Requiere: PostgreSQL propio (interacciones/validaciones/fuentes/cotizaciones),recordAudit equivalente, y las variables de la tabla anterior.
El módulo audit y shared/ deben viajar con él o reemplazarse porequivalentes con las mismas firmas.