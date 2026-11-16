NFR-012 — Exactitud de informes y dashboards
Responsables
Responsable: Edgar Alan Meráz Casas.
Apoyo: Mariana Nuñez de la Hoya.
Objetivo
Garantizar que los indicadores y listados de FR-016 y FR-017correspondan a los datos autorizados existentes en el corte degeneración utilizado y que apliquen las mismas definiciones cuandorepresenten la misma métrica.

El requisito exige actualidad y consistencia; no establece por sísolo actualización continua en tiempo real. La frecuencia deactualización es por consulta (sin caché).

Decisiones del equipo
#	Decisión
A1	Zona horaria: America/Monterrey (ya usada en reports.repository.ts).
A2	Corte de datos: en tiempo de consulta (no hay caché). Cada llamada ejecuta SQL contra la BD.
A3	Redondeo: entero exacto (sin decimales). Todas las métricas son COUNT(*).
A4	Reaperturas: un ticket reabierto no se cuenta como nuevo. Sigue siendo el mismo ticket.
A5	Relaciones múltiples (adjuntos, investigaciones, historial): no duplican filas en los reportes porque getReportTickets consulta solo tickets.
A6	Datos faltantes: se identifican con dataQuality warnings, no se convierten en ceros.
A7	Días sin actividad: no se rellenan con ceros. La interfaz debe indicar la ausencia.
Diccionario de métricas
El catálogo formal está en apps/api/src/modules/reports/reports.metrics.ts.Cada métrica documenta: fórmula, población, fecha de referencia,exclusiones, tratamiento de reaperturas, unidad, redondeo y datosfaltantes.

Métricas del overview (FR-016)
ID	Label	Fórmula	Población	Exclusiones
total	Total de tickets	COUNT(*)	Todos los tickets	Ninguna
open	Tickets abiertos	COUNT(*) WHERE status = 'Open'	Estado Open	Otros estados
assigned	Tickets asignados	COUNT(*) WHERE status = 'Assigned'	Estado Assigned	Otros estados
inProgress	Tickets en progreso	COUNT(*) WHERE status = 'In Progress'	Estado In Progress	Otros estados
resolved	Tickets resueltos	COUNT(*) WHERE status = 'Resolved'	Estado Resolved	Otros estados
closed	Tickets cerrados	COUNT(*) WHERE status = 'Closed'	Estado Closed	Otros estados
overdue	Tickets vencidos	COUNT(*) WHERE status NOT IN ('Resolved','Closed') AND due_date < now()	Activos con plazo vencido	Resueltos, cerrados, sin plazo
unassigned	Sin asignar	COUNT(*) WHERE status NOT IN ('Resolved','Closed') AND assigned_technician_id IS NULL	Activos sin técnico	Resueltos, cerrados, con técnico
withoutPriority	Sin prioridad	COUNT(*) WHERE status NOT IN ('Resolved','Closed') AND priority_id IS NULL	Activos sin prioridad	Resueltos, cerrados, con prioridad
byPriority	Por prioridad	COUNT(*) GROUP BY priority_id	Todos los tickets	Ninguna (incluye NULL)
Métricas de carga de trabajo (FR-016)
ID	Label	Fórmula	Población	Exclusiones
workload	Carga por técnico	COUNT(*) GROUP BY assigned_technician_id	Activos asignados	Resueltos, cerrados, sin técnico
Métricas de actividad (FR-016)
ID	Label	Fórmula	Población	Exclusiones
activity	Actividad por día	COUNT(*) y COUNT(DISTINCT ticket_id) de ticket_history	Eventos del historial	Fuera del rango solicitado
Métricas de listado (FR-016)
ID	Label	Fórmula	Población	Exclusiones
tickets	Listado de tickets	SELECT * con filtros y paginación	Tickets que cumplen filtros	Fuera del rango si from/to
Tratamiento de reaperturas
Un ticket reabierto pasa de Resolved a In Progress.
No se crea un nuevo ticket: el mismo id conserva su historial.
En el overview: se cuenta en inProgress, ya no en resolved.
En la actividad: genera un evento reopened en ticket_history;se cuenta como 1 actividad ese día. El ticket se cuenta 1 vez pordía (COUNT(DISTINCT ticket_id)).
En el listado: aparece una sola vez con su estado actual.
Tratamiento de relaciones múltiples
Un ticket puede tener varios adjuntos, varias investigaciones yvarios eventos de historial.
getReportTickets consulta solo la tabla tickets (sin JOIN aticket_attachments, ticket_investigations ni ticket_history),por lo que no duplica filas.
getOverviewMetrics usa COUNT(*) sobre tickets sin JOIN.
getWorkloadMetrics usa COUNT(*) GROUP BY sobre tickets.
getTicketActivityMetrics usa COUNT(DISTINCT ticket_id) sobreticket_history, evitando duplicar por múltiples eventos delmismo ticket.
Tratamiento de datos faltantes
NFR-012 exige que los datos faltantes no se conviertansilenciosamente en ceros. La implementación:

dataQuality warnings: cada respuesta de métricas incluyeun array dataQuality que identifica tickets con datosincompletos:
withoutPriority: tickets activos sin prioridad asignada.
unassigned: tickets activos sin técnico asignado.
withoutDeadline: tickets activos sin plazo definido.
withoutPriority en overview: el dashboard ya muestracuántos tickets activos no tienen prioridad. El dataQualitywarning confirma que ese conteo es correcto.
Días sin actividad: getTicketActivityMetrics no rellenadías sin eventos con ceros. La interfaz debe indicar la ausenciade datos para ese día.
Limitations en generateReport: generateReport añade unlimitation cuando hay dataQuality warnings: "Se detectarondatos faltantes que podrían afectar la interpretación."
Zona horaria y fechas
Zona horaria: America/Monterrey (configurada en los queriesSQL de reports.repository.ts).
Filtro from: created_at >= (from::date AT TIME ZONE 'America/Monterrey').
Filtro to: created_at < ((to::date + 1 day) AT TIME ZONE 'America/Monterrey').El día to se incluye completo (hasta las 23:59:59).
overdue: usa CURRENT_TIMESTAMP del servidor PostgreSQL(UTC). La comparación con due_date (que también es UTC) esconsistente.
Redondeo
Todas las métricas son conteos (COUNT(*)::integer).
No hay divisiones ni promedios; no se necesita redondeo dedecimales.
Si en el futuro se añaden porcentajes o promedios, la reglaacordada será: redondear a 1 decimal (p. ej. 33.3%).
Consistencia entre resumen y detalle
Verificación	Cómo se garantiza
Suma de estados = total	open + assigned + inProgress + resolved + closed = total (verificado en test de reconciliación).
Overview = generateReport(overview)	Ambos llaman a getOverviewMetrics() y getDataQualityWarnings().
Workload = generateReport(workload)	Ambos llaman a getWorkloadMetrics().
Total del listado = COUNT(*) con filtros	getReportTickets usa CTE con COUNT(*) FROM filtered separado de la paginación.
Paginación no altera el total	El total se calcula antes de LIMIT/OFFSET.
Vigencia de resultados y caché
No hay caché: cada llamada a /reports/* ejecuta SQL contrala BD en tiempo real.
generatedAt en cada respuesta identifica el momento exacto delcorte de datos.
Si el detalle consulta datos posteriores al generatedAt delresumen, la interfaz debe advertirlo.
Alcance de acceso del usuario
Rol	Permisos de reportes
Manager	REPORTS_READ + REPORTS_READ_GLOBAL
Service Advisor	REPORTS_READ (sin global)
Employee, Technician, Administrator	Sin acceso a reportes
getOverviewForUser, getWorkloadForUser, getReportTicketsForUsery getActivityForUser requieren REPORTS_READ_GLOBAL.
listReportDefinitions y generateReport requieren REPORTS_READ.
Los resultados no incluyen información de tickets a los que elusuario no tiene acceso (los queries no filtran por created_byni assigned_technician_id del usuario; muestran datos globales).
Pruebas de reconciliación
apps/api/src/modules/reports/reports.reconciliation.test.ts:

Grupo	Qué verifica
Overview = conteo directo	Cada métrica del overview coincide con COUNT(*) directo de la BD.
Workload = conteo directo	Carga por técnico coincide con GROUP BY directo.
Report tickets = listado directo	Total del listado coincide con COUNT(*) con filtros.
Dashboard e informe coinciden	Overview y workload del dashboard = generateReport.
Reaperturas no duplican	Ticket reabierto se cuenta 1 vez; actividad usa DISTINCT.
Datos faltantes se identifican	dataQuality warnings presentes y correctos.
Permisos respetan alcance	Employee, Technician, Admin reciben 403; Manager 200.
generatedAt válido	Todas las respuestas incluyen timestamp ISO válido.
Ejecutar:

TEST_DATABASE_URL=postgresql://.../omnidesk_test \npm --prefix apps/api test -- --testPathPattern=reconciliation
Archivos principales
apps/api/src/modules/reports/reports.metrics.ts — Diccionario formal
apps/api/src/modules/reports/reports.repository.ts — getDataQualityWarnings
apps/api/src/modules/reports/reports.service.ts — dataQuality en respuestas
apps/api/src/modules/reports/reports.reconciliation.test.ts — Pruebas de reconciliación
docs/NFR-012-Reporting-Accuracy.md — Este documento
Dependencias
FR-016 y FR-017 — Vistas y servicios de métricas.
Base de datos y NFR-010 — Datos consistentes.
FR-008, FR-009 y NFR-009 — Estados y eventos históricos.
FR-019 — Relaciones válidas de problemas recurrentes.
NFR-001 — Alcance autorizado de los resultados.
Coordinación con otros requerimientos
NFR-001: los permisos REPORTS_READ y REPORTS_READ_GLOBAL
viven en la matriz de autorización; los reportes los reutilizan.
NFR-009: los eventos de ticket_history y audit_log son la
fuente de la métrica de actividad; no se duplican ni se cachean.
NFR-010: las constraints de DB garantizan que los conteos sean
consistentes (p. ej. Resolved exige resolution).
FR-009: las reaperturas generan eventos reopened que la
métrica de actividad cuenta como 1 actividad (no como ticket nuevo).
Estado
Implementación funcional disponible para revisión. Las pruebas de
reconciliación verifican que dashboard = informe = conteo directo.
Pendiente de validación final de QA con datos reales del entorno
integrado.