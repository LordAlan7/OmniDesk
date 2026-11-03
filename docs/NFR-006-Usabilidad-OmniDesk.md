# NFR-006 — Usabilidad de los flujos principales de OmniDesk

**Proyecto:** OmniDesk — Plataforma de soporte técnico y gestión del conocimiento  
**Requerimiento:** NFR-006 — Usabilidad de los flujos principales  
**Responsable de las actividades descritas:** Mariana Nuñez de la Hoya  
**Fecha de corte:** 27 de octubre de 2026  
**Estado:** Implementación avanzada; validación funcional guiada parcialmente completada; evaluación formal de usabilidad pendiente.  
**Avance reportado durante el seguimiento:** 98 % **estimado**, no equivalente a aceptación formal.

---

## 1. Objetivo

Mejorar la facilidad de uso, la claridad de navegación y la consistencia de los flujos principales de OmniDesk para los perfiles **Employee, Technician, Service Advisor, Manager y Administrator**, sin alterar las reglas de autorización existentes ni los requerimientos funcionales ya implementados.

El trabajo se concentró en:

- Navegación adaptada a permisos, con accesos claros por rol.
- Formularios comprensibles, validaciones por campo y conservación de los datos escritos ante errores.
- Indicadores de carga, estados vacíos, errores, confirmaciones y resultados de operaciones.
- Compatibilidad de la interfaz con pantallas reducidas y navegación básica mediante teclado.
- Claridad del seguimiento de tickets, de su responsable y del historial de cambios.
- Pruebas funcionales guiadas de los recorridos principales y registro de limitaciones.

> **Criterio de honestidad del informe:** aquí se distingue entre funcionalidad implementada, prueba efectivamente observada y evaluación formal pendiente. El porcentaje de avance se utilizó para organizar el trabajo y no constituye una métrica de éxito de usabilidad acordada con participantes.

## 2. Alcance y ambiente

**Arquitectura utilizada:** monorepositorio OmniDesk; frontend Vue con TypeScript (`apps/web`), backend Node.js/Express con TypeScript (`apps/api`), API REST bajo `/api/v1` y persistencia PostgreSQL.

**Ubicación local del proyecto:** `C:\Omnidesk\OmniDesk`. Las actividades se realizaron en el entorno local, mediante el navegador, PowerShell, VS Code y pgAdmin 4.

**Perfiles considerados:**

| Rol | Recorrido principal considerado |
|---|---|
| Employee | Crear solicitudes y consultar las propias, con su estado y actualizaciones. |
| Technician | Localizar asignaciones, iniciar trabajo, registrar resolución y reabrir un ticket resuelto cuando corresponda. |
| Service Advisor | Consultar tickets, asignar o reasignar técnicos y revisar el historial. |
| Manager | Consultar tickets y modificar la prioridad; revisión de métricas sujeta al módulo de reportes. |
| Administrator | Consultar y administrar usuarios; evitar accesos operativos para los que no posee permisos. |

**Requerimientos relacionados:** FR-005 (clasificación de tickets), FR-010 (información comercial), FR-018 (seguimiento del solicitante), FR-016/FR-017 (informes y métricas), NFR-012 (exactitud de informes). La usabilidad se trabajó sobre las funciones disponibles; no se consideró que NFR-006 sustituyera el desarrollo de las funcionalidades pendientes de otros requerimientos.

## 3. Actividades realizadas

### 3.1. Preparación y revisión del proyecto

1. Se revisó el frontend existente y la relación entre componentes, servicios API, rutas y roles.
2. Se trabajó sobre los archivos Vue del frontend y sobre la implementación ya disponible en el backend, evitando modificar permisos de seguridad sin justificación.
3. Se utilizó `npm run type-check` dentro de `apps/web` en distintos momentos. La salida observada fue `vue-tsc --build` y el comando regresó a PowerShell sin mostrar errores.
4. Se encendieron por separado los servidores de desarrollo de API y frontend. Cuando el login mostró **«No se pudo conectar con el servidor»**, se revisó el arranque de la API y se logró continuar con las pruebas de tickets.

### 3.2. Dashboard principal (`apps/web/src/views/DashboardView.vue`)

Se reemplazó la pantalla de bienvenida básica por un panel de **accesos principales** basado en la sesión y los permisos, con tarjetas para crear tickets, consultar solicitudes propias, consultar tickets operativos, acceder a usuarios y abrir la biblioteca de documentos, según corresponda. Se añadieron textos breves que explican la función de cada sección, diseño de tarjetas adaptable a móviles y estilos de foco para teclado.

Posteriormente se corrigió el criterio de visibilidad del acceso **Consultar tickets**: se ofrece a usuarios con `tickets:read:all` y a técnicos con permiso de lectura, en lugar de mostrarse indiscriminadamente a cualquier usuario con `tickets:read`.

### 3.3. Creación de tickets (`apps/web/src/views/CreateTicketView.vue`)

Se trabajó en un formulario con campos de título, descripción, categoría, tienda/ubicación y modelo de motocicleta, respetando FR-005 y FR-010. Entre las mejoras estuvieron:

- Mensajes específicos de validación y asociación de errores con los campos.
- Enfoque del primer campo inválido.
- Indicadores de carga y reintento al consultar categorías.
- Bloqueo de envíos duplicados mientras se guarda.
- Conservación de datos en caso de error.
- Confirmación tras creación y enlace para continuar con el seguimiento.
- Ajustes de diseño responsivo.

**Evidencia funcional observada:** se creó el **ticket #5**, «Motocicleta no enciende», con ubicación **Sucursal Centro** y modelo **Italika FT150**. Se visualizó la confirmación de creación y posteriormente el seguimiento en la cuenta del empleado.

### 3.4. Seguimiento del empleado (`apps/web/src/views/MyTicketsView.vue`)

Se mejoraron el listado y detalle de solicitudes propias, con etiquetas de estado legibles, filtros, paginación, estados de carga, mensajes de error, conservación de filtros mediante parámetros de la URL y presentación móvil mediante tarjetas para evitar depender de una tabla horizontal.

**Evidencia funcional observada:** el empleado consultó sus tickets #4 y #5 y accedió al detalle del #5. Después de la intervención del técnico, el empleado pudo ver el estado actualizado **En progreso**.

### 3.5. Listado operativo (`apps/web/src/views/TicketsView.vue`)

Se revisaron los filtros por estado, paginación, nombre de técnico asignado, tratamiento de la lista vacía y navegación al detalle. Se trabajó una propuesta de tarjetas para móvil, manteniendo la tabla en escritorio. Se comprobó en una sesión de técnico que la lista mostraba los tickets asignados con sus estados y responsables.

**Limitación pendiente:** aunque el técnico visualizó sus asignaciones, **no quedó implementado ni probado un filtro dedicado «Mis asignaciones» con paginación desde el backend**. La consulta existente acepta estado, prioridad y categoría; no se encontró un parámetro de técnico asignado. No debe considerarse resuelto ese filtro específico.

### 3.6. Detalle del ticket (`apps/web/src/views/TicketDetailView.vue`)

Se mantuvieron y mejoraron las secciones de descripción, categoría, información comercial, responsable, asignación y reasignación, resolución e historial. Se añadieron confirmaciones antes de operaciones relevantes, indicadores de proceso y resultados de éxito o error; también se ajustaron anchos, controles y espaciado para móvil.

**Cambios funcionales del técnico:**

- Botón **Iniciar trabajo**, disponible para tickets en estado `Assigned` y usuarios autorizados.
- Opción **Reabrir trabajo** en tickets `Resolved`, pasando a `In Progress`.
- Formulario **Registrar resolución**, con texto obligatorio de 5 a 5000 caracteres.
- Conexión con los endpoints de estado y resolución; conservación del texto ante fallos de guardado.
- Visualización de la resolución y su fecha.
- Una última revisión incorporó validación propia en español y distinguió **«Resolución anterior»** al estar nuevamente en progreso.

**Cambios funcionales del gerente:**

- Se añadió **Prioridad del ticket**, con la prioridad actual y un editor visible únicamente con `tickets:priority:update`.
- Se habilitó selección de prioridad, confirmación, estado de guardado, errores y mensaje de éxito.
- Se adaptó el historial para describir cambios de prioridad.

### 3.7. Servicios frontend (`apps/web/src/services/tickets.ts`)

Se conservaron los servicios existentes (`listTickets`, `getTicket`, `getEligibleTechnicians`, `assignTechnician`, `getTicketHistory`, `getCategories`, `createTicket`, `changeTicketCategory`, `updateBusinessInformation`) y se añadieron las integraciones:

| Función en frontend | Operación de API | Uso |
|---|---|---|
| `changeTicketStatus(id, status)` | `PATCH /tickets/:id/status` | Iniciar o reabrir trabajo. |
| `resolveTicket(id, resolution)` | `POST /tickets/:id/resolution` | Registrar solución. |
| `updateTicketPriority(id, priorityId)` | `PATCH /tickets/:id/priority` | Modificar prioridad como gerente. |

Se definieron las prioridades que expone el backend: **1 Baja (Low), 2 Media (Medium), 3 Alta (High), 4 Crítica (Critical)**.

### 3.8. Menú general y rutas (`apps/web/src/App.vue`, `apps/web/src/router/index.ts`)

Se reorganizó el encabezado con enlaces claros, identidad de OmniDesk, usuario conectado, cierre de sesión y menú desplegable para pantallas pequeñas. La navegación se cierra al cambiar de ruta y ofrece estilos de foco para navegación por teclado.

Se alineó la visibilidad de **Tickets**, **Mis tickets**, **Usuarios** y **Manuales y documentación** con el perfil y los permisos. En el router se introdujo una verificación del área operativa de tickets para bloquear accesos directos de cuentas sin autorización de operación, sin modificar la política del backend.

**Hallazgo importante de seguridad/UX:** en `rolePermissions.ts` se confirmó que el rol **Administrator no posee `TICKETS_READ_ALL` ni `TICKETS_ASSIGN`** por separación de deberes. Un comentario anterior de `policy.ts` mencionaba a Admin como lector general, pero la configuración efectiva del rol lo excluye. Se respetó la regla efectiva y se evitó otorgar privilegios nuevos para corregir solamente la interfaz.

## 4. Reglas de negocio verificadas en backend

### 4.1. Flujo de estados

| Estado actual | Transiciones previstas | Operación para realizarlas |
|---|---|---|
| Open | Assigned | Endpoint de asignación. |
| Assigned | In Progress | Endpoint de cambio de estado. |
| In Progress | Resolved | Endpoint de resolución, con texto obligatorio. |
| Resolved | In Progress o Closed | Cambio de estado para reabrir; endpoint específico para cerrar. |
| Closed | Ninguna | Estado final. |

La API rechaza solicitar `Assigned`, `Resolved` o `Closed` a través del cambio de estado genérico; esas acciones requieren su endpoint correspondiente.

Las operaciones también comprueban los permisos `tickets:status:update`, `tickets:resolve`, `tickets:assign` y `tickets:priority:update`, según corresponda. Las acciones del técnico están sujetas a ser el técnico asignado o personal autorizado.

### 4.2. Reglas de validación

- Resolución: mínimo **5** y máximo **5000** caracteres; se aplica `trim()` antes de enviarla.
- Motivo de asignación: longitud máxima **500** caracteres según el esquema del backend.
- Prioridades: identificadores válidos **1, 2, 3 y 4**.
- Las acciones sensibles se confirman antes de ejecutarse en la interfaz.

## 5. Pruebas funcionales guiadas y resultados observados

Las comprobaciones fueron realizadas manualmente en el entorno local. No constituyen una evaluación de usabilidad con participantes independientes.

| ID | Rol / área | Acción observada | Resultado | Estado |
|---|---|---|---|---|
| P-01 | Employee | Crear ticket con información obligatoria. | Se creó el ticket #5 y se mostró confirmación. | Verificado |
| P-02 | Employee | Consultar «Mis tickets» y detalle. | Se visualizaron solicitudes propias y sus estados. | Verificado |
| P-03 | Technician | Abrir ticket #5 asignado. | Se mostró responsable Demo Technician. | Verificado |
| P-04 | Technician | Pulsar «Iniciar trabajo». | El ticket #5 cambió a **En progreso**. | Verificado |
| P-05 | Technician | Registrar resolución. | El ticket #5 pasó a **Resuelto** y mostró el texto y la fecha. | Verificado |
| P-06 | Technician | Pulsar «Reabrir trabajo». | El ticket #5 regresó a **En progreso** y volvió el formulario. | Verificado |
| P-07 | Service Advisor | Asignar técnico. | Se asignó un responsable para la prueba del técnico. | Verificado |
| P-08 | Service Advisor | Reasignar ticket #2 de «persistencia» a Demo Technician. | Se mostró el nuevo responsable y confirmación de guardado. | Verificado |
| P-09 | Service Advisor | Consultar historial del ticket #2. | Se observó el evento de reasignación con fecha y actor. | Verificado |
| P-10 | Manager | Cambiar la prioridad del ticket #2 a Alta. | Tras corregir datos de referencia, se guardó con mensaje de éxito. | Verificado |
| P-11 | Administrator | Acceder directamente a `/tickets`. | Redirección a `/forbidden` y mensaje de acceso denegado. | Verificado |
| P-12 | Administrator | Consultar «Usuarios y técnicos». | Se visualizó el listado con roles, estado y controles administrativos. | Verificado |
| P-13 | Employee | Consultar estado del ticket #5 después de la atención. | Se mostró **En progreso**, consistente con la reapertura. | Verificado |
| P-14 | Technician | Consultar tickets después de actualizar menú y rutas. | Se mostraron los tickets #5, #4 y #2 asignados a Demo Technician. | Verificado |
| P-15 | Navegación | Recorrer controles en Tickets con tecla `Tab`. | El usuario confirmó que se pueden recorrer los controles. | Verificado de manera básica |
| P-16 | Technician | Escribir `abc` como resolución e intentar enviarla. | La validación nativa impidió el envío, pero mostró aviso en inglés. | Hallazgo corregido en código |
| P-17 | Technician | Comprobar la nueva validación española tras `novalidate`. | El código actualizado pasó `vue-tsc --build`; **no se recibió aún confirmación visual posterior**. | Pendiente de verificación visual |
| P-18 | Technician | Distinguir «Resolución anterior» tras reapertura. | La lógica fue implementada y pasó comprobación de tipos; **falta evidencia visual posterior**. | Pendiente de verificación visual |
| P-19 | Manager | Consultar reportes/métricas reales. | Los endpoints existentes responden `501` porque no están implementados. | Bloqueado por dependencia |
| P-20 | Usabilidad | Evaluación con participantes, tareas, errores, ayuda y criterios previamente acordados. | No consta que se haya realizado esa evaluación formal. | Pendiente |

### 5.1. Estado de tickets de referencia al final de las pruebas observadas

- **Ticket #5 — Motocicleta no enciende:** asignado a Demo Technician; quedó **En progreso** después de probar la reapertura. Conservaba la resolución registrada anteriormente para consulta.
- **Ticket #2 — Prueba FR-007 persistencia:** reasignado a Demo Technician; se verificó posteriormente la prioridad **Alta** desde Manager.
- **Ticket #4 — La motocicleta no enciende:** se observó como **Cerrado** en los listados; no se alteró para estas pruebas.

Estos son estados observados durante la sesión; pueden cambiar si se realizan operaciones posteriores.

## 6. Incidencias encontradas y acciones realizadas

| Incidencia | Diagnóstico | Corrección o tratamiento | Resultado |
|---|---|---|---|
| El login mostraba «No se pudo conectar con el servidor». | El navegador no alcanzaba la API durante la prueba. | Revisar/iniciar backend con `npm run dev` en `apps/api`. | La comunicación volvió a permitir iniciar sesión y consultar tickets. |
| Administrator encontraba 0 tickets y el detalle #5 mostraba «Ticket was not found». | El rol Administrator carece de lectura general de tickets por separación de deberes; `canAccessTicket` puede devolver `not found` al denegar acceso. | Respetar permisos; ajustar menú, Dashboard y rutas para no ofrecer área operativa a ese rol. | Acceso directo a `/tickets` bloqueado con pantalla comprensible. |
| Manager recibió `500 Internal Server Error` al guardar prioridad Alta. | PostgreSQL devolvió `23503`: `tickets.priority_id = 3` no existía en `ticket_priorities`. | Consultar tabla de referencia en pgAdmin y registrar los cuatro valores 1–4 con inserción idempotente. | Cambio del ticket #2 a Alta guardado correctamente. |
| El aviso por resolución `abc` aparecía en inglés. | Mensaje nativo de validación HTML del navegador. | Añadir `novalidate`, validación en español, mensaje asociado al campo, foco y `aria-invalid`. | Compiló sin errores; pendiente comprobar presentación final en navegador. |
| Un ticket reabierto seguía mostrando «Resolución registrada». | Etiqueta ambigua para una solución que ya no cierra la atención actual. | Distinguir «Resolución anterior» y explicar por qué requiere nueva solución. | Código actualizado y comprobación de tipos correcta; pendiente captura visual final. |
| Reportes del gerente no disponibles. | `reports.routes.ts` contiene `notImplemented`; `/reports/overview`, `/reports/tickets` y `/reports/workload` responden `501`. | Registrar dependencia de FR-016, FR-017 y NFR-012; no mostrar métricas ficticias. | Pendiente de los requerimientos propietarios. |

### 6.1. Datos de referencia de prioridades

El backend define en `tickets.types.ts`:

```ts
export const PRIORITIES: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
}
```

Se comprobó en pgAdmin que `public.ticket_priorities` estaba vacía en la base `omnidesk` consultada. Se registraron los cuatro identificadores mediante una sentencia equivalente a:

```sql
INSERT INTO public.ticket_priorities (id, name)
VALUES
    (1, 'Low'),
    (2, 'Medium'),
    (3, 'High'),
    (4, 'Critical')
ON CONFLICT (id) DO NOTHING;
```

Se verificaron los registros y el guardado posterior de la prioridad Alta desde la interfaz. La base `omnidesk_test` no fue el objetivo de esta corrección. Para que otros entornos funcionen, conviene trasladar esta carga de datos de referencia a la semilla/migración oficial correspondiente, previa revisión del equipo.

## 7. Archivos involucrados

| Ruta | Intervención realizada o revisada |
|---|---|
| `apps/web/src/App.vue` | Navegación general, menú responsivo, enlaces según permisos, usuario y cierre de sesión. |
| `apps/web/src/router/index.ts` | Guardias de acceso, restricciones por permiso y área operativa de tickets. |
| `apps/web/src/views/DashboardView.vue` | Tarjetas de acceso y visibilidad según rol. |
| `apps/web/src/views/CreateTicketView.vue` | Formulario, validaciones, mensajes, reintentos y confirmación de creación. |
| `apps/web/src/views/MyTicketsView.vue` | Seguimiento de solicitudes, filtros, estados, detalles y presentación móvil. |
| `apps/web/src/views/TicketsView.vue` | Listado de tickets, consulta por estado, responsable y mejoras de presentación móvil. |
| `apps/web/src/views/TicketDetailView.vue` | Información comercial, asignación, historial, acciones del técnico, prioridades y validación en español. |
| `apps/web/src/services/tickets.ts` | Integración de los endpoints de estado, resolución y prioridad. |
| `apps/api/src/modules/tickets/tickets.routes.ts` | Inspección de rutas de tickets existentes. |
| `apps/api/src/modules/tickets/tickets.service.ts` | Inspección de transiciones, autorizaciones y guardado de prioridad. |
| `apps/api/src/modules/tickets/tickets.schemas.ts` | Inspección de esquemas de filtros, prioridad y resolución. |
| `apps/api/src/modules/tickets/tickets.types.ts` | Identificación de estados y prioridades válidos. |
| `apps/api/src/shared/authorization/rolePermissions.ts` | Verificación del alcance de cada rol, sin alterar permisos. |
| `apps/api/src/shared/authorization/policy.ts` | Verificación de visibilidad de registros. |
| `apps/api/src/modules/reports/reports.routes.ts` | Comprobación de rutas de reportes sin implementar. |
| `apps/api/src/modules/reports/index.ts` | Confirmación de dependencia de FR-016, FR-017 y NFR-012. |
| PostgreSQL: `public.ticket_priorities` | Inserción y verificación de datos de referencia faltantes. |

## 8. Evidencias de pantalla recomendadas para adjuntar

Las capturas se visualizaron durante el trabajo guiado. **No están incrustadas en este archivo Markdown**, por lo que para entregar evidencia reproducible deben guardarse dentro del repositorio, por ejemplo en `docs/evidencias/NFR-006/`, y añadir los enlaces relativos a continuación.

| ID de evidencia | Captura sugerida | Qué demuestra |
|---|---|---|
| E-01 | Dashboard de Demo Employee | Accesos pertinentes al rol. |
| E-02 | Creación y confirmación del ticket #5 | Validación y resultado de alta de solicitud. |
| E-03 | «Mis tickets» del empleado | Seguimiento de solicitudes propias. |
| E-04 | Ticket #5 al iniciar trabajo | Cambio a En progreso y confirmación. |
| E-05 | Ticket #5 resuelto | Registro y visualización de resolución. |
| E-06 | Ticket #5 reabierto | Retorno a En progreso y disponibilidad del formulario. |
| E-07 | Selector de técnico en ticket #2 | Opciones de reasignación. |
| E-08 | Ticket #2 tras reasignación | Nuevo responsable Demo Technician. |
| E-09 | Historial del ticket #2 | Trazabilidad de la reasignación. |
| E-10 | Cambio de prioridad a Alta | Flujo Manager y confirmación de guardado. |
| E-11 | Tabla `ticket_priorities` en pgAdmin | Corrección del catálogo de referencia. |
| E-12 | Acceso denegado al Administrator | Restricción de ruta `/tickets`. |
| E-13 | Gestión de usuarios con Administrator | Acceso al área administrativa permitida. |
| E-14 | Listado de tickets de Demo Technician | Localización de asignaciones. |
| E-15 | Mensaje de validación para `abc` | Hallazgo inicial y, posteriormente, mensaje corregido en español. |
| E-16 | «Resolución anterior» | Claridad del estado tras reapertura; captura aún por obtener. |
| E-17 | Vista móvil y foco mediante teclado | Adaptación visual y accesibilidad básica. |

Ejemplo de enlace a incorporar tras guardar una captura:

```md
![E-10: cambio de prioridad a Alta](./evidencias/NFR-006/E-10-prioridad-alta.png)
```

No se deben crear enlaces a imágenes que todavía no estén guardadas en la ruta indicada.

## 9. Verificaciones técnicas

En la carpeta `apps/web`, el comando utilizado fue:

```powershell
npm run type-check
```

La ejecución más reciente, tras la incorporación de validación en español y el tratamiento de resoluciones anteriores, terminó mostrando:

```text
> @omnidesk/web@0.0.0 type-check
> vue-tsc --build
```

No se mostraron errores y se recuperó el prompt de PowerShell. Esto **verifica tipos/compilación estática**, no sustituye las pruebas automatizadas, pruebas integrales ni la comprobación visual final.

Comandos habituales utilizados durante las pruebas:

```powershell
# Terminal API
cd C:\Omnidesk\OmniDesk\apps\api
npm run dev

# Terminal web
cd C:\Omnidesk\OmniDesk\apps\web
npm run dev

# Verificación de tipos
npm run type-check
```

## 10. Pendientes y riesgos antes de cerrar el requerimiento

1. **Confirmar visualmente los últimos ajustes:** validación de texto de resolución en español y etiqueta «Resolución anterior».
2. **Evaluación formal de usabilidad:** acordar con el equipo los criterios de aceptación antes de medir; definir tareas por rol, participantes representativos, errores, ayuda requerida, observaciones y problemas detectados. No se establecen porcentajes de éxito inventados.
3. **Registrar evidencias finales:** recopilar y nombrar las capturas, enlazarlas desde el Markdown y documentar los resultados reales de cada participante o sesión de prueba.
4. **Completar o justificar «Mis asignaciones»:** el listado de técnico funcionó con tickets asignados, pero no se implementó un filtro específico de asignación con paginación correcta del lado del servidor.
5. **Documentación de investigación del técnico:** iniciar trabajo y registrar resolución se verificaron; aún debe determinarse si existe un flujo separado y usable para documentar la investigación durante la atención.
6. **Reportes del gerente:** evaluar su usabilidad cuando FR-016/FR-017 y NFR-012 tengan endpoints funcionales. Actualmente permanecen bloqueados por respuestas `501`.
7. **Pruebas de regresión:** ejecutar los conjuntos de pruebas relevantes del frontend y backend, además de `type-check`, para comprobar que las mejoras no afectaron otros flujos.
8. **Revisión con el equipo:** confirmar criterios de aceptación y alcance de NFR-006; corregir el comentario desactualizado de `policy.ts` si procede y planear semilla de prioridades para otros entornos.
9. **Versionamiento:** revisar `git status`, cambios y rama antes de confirmar commits o integrar en `develop`. Este informe no supone que los últimos cambios ya se hayan subido al remoto.

## 11. Propuesta de registro para evaluación de usabilidad

Completar esta tabla durante sesiones con participantes representativos, **sin inventar datos**:

| Participante / rol | Tarea | ¿La completó? | Errores observados | ¿Necesitó ayuda? | Observaciones / acciones |
|---|---|---|---|---|---|
| Por registrar — Employee | Crear y consultar una solicitud | Pendiente de sesión formal | — | — | — |
| Por registrar — Technician | Localizar asignación, iniciar y resolver | Pendiente de sesión formal | — | — | — |
| Por registrar — Service Advisor | Asignar/reasignar y consultar historial | Pendiente de sesión formal | — | — | — |
| Por registrar — Manager | Cambiar prioridad y consultar resultados disponibles | Pendiente de sesión formal | — | — | Dependencia de reportes 501 |
| Por registrar — Administrator | Gestionar acceso a usuarios | Pendiente de sesión formal | — | — | — |

**Criterios de evaluación:** deben acordarse antes de ejecutar esta actividad; el documento no fija umbrales numéricos arbitrarios.

## 12. Conclusión

Durante la implementación del NFR-006 se fortaleció la usabilidad de OmniDesk en las vistas de creación, seguimiento, listado y detalle de tickets, así como en su navegación por roles. Las pruebas guiadas confirmaron recorridos relevantes: creación y consulta de solicitudes por el empleado; inicio de trabajo, resolución y reapertura por el técnico; asignación y reasignación con historial por el asesor; actualización de prioridades por el gerente; y acceso administrativo restringido a funciones autorizadas.

También se identificaron y trataron incidencias reales: falta de conexión temporal con la API, acceso confuso del administrador a la sección de tickets, ausencia de prioridades en la tabla de referencia PostgreSQL y mensajes de validación en inglés. Se añadieron ajustes finales para expresar errores en español y distinguir la resolución anterior de un ticket reabierto, aunque su comprobación visual final permanece pendiente.

El progreso del **98 %** comunicado durante el seguimiento debe entenderse como una **estimación del trabajo de implementación**, no como cumplimiento final demostrado del NFR-006. Para solicitar la aceptación del requerimiento falta completar la evaluación de usabilidad con criterios acordados, adjuntar evidencias finales, verificar las correcciones visuales recientes y documentar las dependencias funcionales que siguen sin implementarse, especialmente reportes y métricas.
