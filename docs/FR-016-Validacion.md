
# FR-016 — Dashboard y métricas de soporte

## Información general

- **Proyecto:** OmniDesk
- **Requerimiento:** FR-016 — Dashboard and Service Metrics
- **Prioridad:** Should Have
- **Responsable:** Mariana Núñez de la Hoya
- **Validación QA:** Edgar Alan Meráz Casas

## 1. Objetivo

Implementar un panel de soporte que permita al gerente consultar información actualizada sobre los tickets, prioridades, fechas límite, carga de trabajo y actividad del equipo de soporte.

## 2. Funcionalidades implementadas

Se desarrollaron las siguientes funcionalidades:

- Indicadores generales de tickets.
- Distribución de tickets por estado.
- Distribución de tickets por prioridad.
- Identificación de tickets vencidos.
- Visualización de carga de trabajo por técnico.
- Consulta de tickets con filtros y paginación.
- Gráfica de actividad de tickets por periodo.
- Actualización manual de las métricas.
- Interfaz adaptable a computadora y celular.

## 3. Endpoints utilizados

| Método | Endpoint | Función |
|---|---|---|
| GET | /api/v1/reports/overview | Estadísticas generales |
| GET | /api/v1/reports/workload | Carga de trabajo |
| GET | /api/v1/reports/tickets | Listado y filtros |
| GET | /api/v1/reports/activity | Actividad por periodo |

Los endpoints requieren autenticación y permiso de consulta global de reportes.

## 4. Control de acceso

El panel FR-016 está dirigido a los gerentes autorizados.

- Manager: puede consultar el panel global.
- Service Advisor: no puede consultar los endpoints globales.
- Employee: sin acceso al panel global.
- Technician: sin acceso al panel global.
- Administrator: sin acceso al panel global con su rol actual.

El acceso a otros reportes para usuarios autorizados corresponde al alcance de FR-017.

## 5. Pruebas realizadas

### Pruebas automáticas

Se ejecutaron dos archivos de pruebas:

- reports.service.test.ts
- reports.additional.test.ts

Resultado: 20 pruebas aprobadas de 20 ejecutadas.

### Validaciones HTTP

| Prueba | Resultado |
|---|---|
| Consultar actividad sin autenticación | HTTP 401 |
| Consultar actividad con rango de fechas inválido | HTTP 400 |
| Consultar tickets con estado inexistente | HTTP 400 |
| Service Advisor consulta overview | HTTP 403 |
| Service Advisor consulta workload | HTTP 403 |
| Service Advisor consulta tickets | HTTP 403 |
| Service Advisor consulta activity | HTTP 403 |

### Validación de funcionamiento

Se comprobó la consulta de datos reales desde PostgreSQL.

La gráfica mostró correctamente ocho actividades registradas entre el 26 y el 27 de octubre de 2026.

### Validación del frontend

La compilación de Vue con TypeScript y Vite finalizó correctamente.

Se revisó el panel en computadora y se comprobó visualmente el menú desplegable en vista móvil.

## 6. Archivos principales

- apps/api/src/modules/reports/reports.routes.ts
- apps/api/src/modules/reports/reports.service.ts
- apps/api/src/modules/reports/reports.repository.ts
- apps/api/src/modules/reports/reports.schemas.ts
- apps/api/src/modules/reports/reports.service.test.ts
- apps/api/src/modules/reports/reports.additional.test.ts
- apps/web/src/services/reports.ts
- apps/web/src/views/SupportDashboardView.vue

## 7. Observaciones

El dashboard del Manager cumple funcionalmente con los criterios principales establecidos para FR-016.

La implementación de reportes adicionales para otros usuarios debe evaluarse dentro de FR-017.

La compilación general del backend conserva errores de TypeScript previamente identificados en archivos ajenos al módulo de reportes. Estos errores deben atenderse como parte de la revisión general del proyecto.

La aceptación final queda sujeta a revisión de QA.

## 8. Conclusión

Se implementó un panel de soporte que permite al gerente consultar información sobre el estado de los tickets, las prioridades, los vencimientos, la carga de trabajo y la actividad del equipo.

Las funcionalidades fueron probadas con datos reales y pruebas automáticas. El panel también cuenta con controles de acceso y una interfaz adaptable a diferentes tamaños de pantalla.
