# FR-007 — Asignación y reasignación de técnicos

## Responsables

- Responsable: Mariana Nuñez de la Hoya.
- Apoyo: César Alexis Meza Martínez.
- Validación QA: Edgar Alan Meráz Casas.

## Objetivo

Permitir que un asesor de servicio autorizado asigne y reasigne
un técnico responsable a un ticket, conservando su información
y el historial de cambios.

## Tecnologías

- Frontend: Vue y TypeScript.
- Backend: Node.js, Express y TypeScript.
- Base de datos: PostgreSQL.
- Pruebas del backend: Jest y Supertest.

## Funcionalidades implementadas

### Backend

- Consulta de candidatos con cuenta activa y rol Technician.
- Validación del permiso tickets:assign.
- Verificación de acceso al ticket.
- Validación de elegibilidad del técnico al guardar.
- Asignación y reasignación de un responsable actual.
- Rechazo de autoasignación por usuarios sin permiso de asignación.
- Persistencia de tickets e historial en PostgreSQL.
- Guardado del ticket y los eventos de historial en una transacción.
- Control de versiones para rechazar cambios desactualizados.
- Respuesta 409 CONFLICT cuando la versión enviada ya no es vigente.
- Registro del responsable anterior, nuevo responsable, asesor,
  fecha y motivo cuando se proporciona.
- Seleccionar al responsable actual no genera cambios, historial
  ni notificaciones duplicadas.
- Consulta del nombre del responsable actual.
- Revisión del acceso después de una reasignación.
- Comprobación de tickets pendientes antes de desactivar un técnico
  o retirarle ese rol.

### Frontend

- Listado de tickets con paginación y filtro por estado.
- Visualización del responsable actual en el listado.
- Pantalla de detalle del ticket.
- Visualización de “Sin asignar” cuando no hay responsable.
- Controles de asignación y reasignación según permisos y estado.
- Selector de técnicos candidatos.
- Campo de motivo opcional.
- Confirmación del nuevo responsable antes de guardar.
- Acción de cancelar.
- Indicadores de carga y bloqueo de envío durante el guardado.
- Mensajes de éxito y error.
- Actualización de información ante conflictos.
- Historial de cambios con fecha, actor y motivo.
- Navegación a tickets, usuarios y documentación según permisos.

## Reglas actualmente implementadas

Estas reglas describen el comportamiento del código.
Su confirmación final con el equipo y QA sigue pendiente.

| Aspecto | Comportamiento |
| --- | --- |
| Responsable actual | Un técnico por ticket |
| Candidato elegible | Cuenta activa con rol Technician |
| Estados permitidos | Open y Assigned |
| Primera asignación | Cambia Open a Assigned |
| Reasignación | Conserva el estado Assigned |
| Motivo | Opcional, máximo 1000 caracteres |
| Versión | expectedVersion es obligatorio |
| Mismo responsable | No genera una nueva asignación |
| Sin candidatos | Conserva el responsable actual o el ticket sin asignar |
| Desactivación de técnico | Se bloquea si tiene tickets sin cerrar |
| Acceso histórico | Haber sido responsable no concede acceso por sí solo |

El formulario de asignación no envía cambios de plazo.
La asignación conserva el plazo vigente del ticket.
Si una solicitud incluye un dueDate diferente, la API la rechaza
con un error de validación.
su uso debe revisarse contra la regla final acordada.

La elegibilidad por cuenta activa y rol no representa disponibilidad
operativa por horario, carga, ausencia o especialidad. Esa política
sigue pendiente de definición.

## Acceso por roles

La autorización real depende de la matriz de permisos del backend.

- Employee: consulta tickets propios según las reglas de visibilidad.
- Technician: consulta tickets asignados y los que pueda ver por otros
  permisos expresamente autorizados.
- Service Advisor: asigna y reasigna con tickets:assign.
- Manager: conserva las funciones autorizadas por su matriz,
  como definir prioridad.
- Administrator: gestiona usuarios según sus permisos; el rol por sí
  solo no concede asignación ni consulta global de tickets.

## Cuentas de demostración

Exclusivas para desarrollo y pruebas.
Son las credenciales definidas por la semilla de demostración;
deben existir en la base de datos utilizada y conservar esa contraseña.

| Rol | Correo | Contraseña de demostración |
| --- | --- | --- |
| Employee | employee@company.com | ChangeMe123! |
| Technician | technician@company.com | ChangeMe123! |
| Service Advisor | advisor@company.com | ChangeMe123! |
| Manager | manager@company.com | ChangeMe123! |
| Administrator | admin@company.com | ChangeMe123! |

Durante la validación de FR-007 se comprobó el inicio de sesión
del asesor y del técnico de demostración contra la API local.

Las cuentas creadas por Cypress u otras pruebas tienen sus propias
credenciales y no deben confundirse con estas cuentas de demostración.

## Iniciar el proyecto

Abrir dos terminales desde la raíz del repositorio.

### Terminal 1 — Backend

    cd apps/api
    npm run dev

API local:

    http://localhost:3000/api/v1

Se requiere PostgreSQL disponible y DATABASE_URL configurada
en el entorno de la API.

### Terminal 2 — Frontend

    npm --prefix apps/web run dev

Direcciones habituales:

- Login: http://localhost:5173/login
- Listado: http://localhost:5173/tickets
- Detalle: http://localhost:5173/tickets/2

El identificador 2 corresponde al ticket utilizado durante las
pruebas manuales; puede ser diferente en otra base de datos.

## Preparación de base de datos

Se reutilizan las tablas de la migración inicial:

- tickets
- ticket_history
- users
- roles
- user_roles
- ticket_categories

La migración 004_ticket_assignment.sql agrega:

- tickets.version
- ticket_history.reason

Para aplicarla, desde la raíz:

    cd apps/api
    npx tsx src/scripts/migrate-ticket-assignment.ts

El script requiere que el esquema previo ya exista.

### Categorías

Para consultar categorías:

    npx tsx src/scripts/list-ticket-categories.ts

Para registrar las categorías utilizadas durante la implementación:

    npx tsx src/scripts/seed-ticket-categories.ts

Categorías de la semilla:

- Ensamblado.
- Activado.
- Problema de tienda.

Los identificadores deben consultarse en cada base de datos;
no se debe asumir que siempre son 1, 2 y 3.

## Endpoints

Todos requieren una sesión válida y las autorizaciones correspondientes.

| Método | Ruta | Función |
| --- | --- | --- |
| POST | /api/v1/tickets | Crear ticket |
| GET | /api/v1/tickets | Listar tickets visibles |
| GET | /api/v1/tickets/:id | Consultar detalle |
| PATCH | /api/v1/tickets/:id | Actualizar información |
| GET | /api/v1/tickets/:id/eligible-technicians | Consultar candidatos |
| PATCH | /api/v1/tickets/:id/assignment | Asignar o reasignar |
| GET | /api/v1/tickets/:id/history | Consultar historial |

### Ejemplo de asignación

    {
      "technicianId": 6,
      "expectedVersion": 4,
      "reason": "Cambio de responsable autorizado."
    }

expectedVersion debe obtenerse de la consulta actual del ticket.
Después de un conflicto, se debe consultar nuevamente y revisar
el responsable vigente antes de intentar otra modificación.

### Respuestas relevantes

- 400: datos inválidos o técnico no elegible.
- 401: sesión ausente o inválida.
- 403: operación sin permiso.
- 404: ticket inexistente o no visible para el solicitante.
- 409: conflicto de versión o estado incompatible.

## Archivos principales

### Backend

- apps/api/src/modules/tickets/tickets.types.ts
- apps/api/src/modules/tickets/tickets.schemas.ts
- apps/api/src/modules/tickets/tickets.repository.ts
- apps/api/src/modules/tickets/tickets.postgres.repository.ts
- apps/api/src/modules/tickets/tickets.service.ts
- apps/api/src/modules/tickets/tickets.routes.ts
- apps/api/src/modules/tickets/tickets.lifecycle.ts
- apps/api/src/modules/tickets/tickets.test.ts
- apps/api/src/modules/users/index.ts
- apps/api/src/modules/users/users.service.ts
- apps/api/src/modules/users/users.test.ts
- apps/api/db/migrations/004_ticket_assignment.sql

### Scripts

- apps/api/src/scripts/migrate-ticket-assignment.ts
- apps/api/src/scripts/list-ticket-categories.ts
- apps/api/src/scripts/seed-ticket-categories.ts

### Frontend

- apps/web/src/services/tickets.ts
- apps/web/src/views/TicketsView.vue
- apps/web/src/views/TicketDetailView.vue
- apps/web/src/router/index.ts
- apps/web/src/App.vue

## Verificación

Desde la raíz del repositorio:

    npm --prefix apps/api run typecheck
    npm --prefix apps/api test -- --runInBand
    npm --prefix apps/web run build
    git diff --check

Resultados reportados durante la implementación:

- Compilación del backend sin errores.
- 64 pruebas aprobadas después de agregar la prueba de reasignación.
- Las 14 pruebas de integración previamente omitidas no se cuentan
  como aprobadas.
- Build del frontend aprobado.
- Revisión de espacios con git diff --check sin incidencias.

Los tests habituales de tickets usan memoria.
La persistencia se comprobó adicionalmente mediante solicitudes
manuales contra la API con PostgreSQL.

## Pruebas realizadas

- Creación de ticket en PostgreSQL.
- Consulta de candidatos.
- Asignación inicial.
- Reasignación entre técnicos.
- Conservación del historial y registro del motivo.
- Recuperación del ticket y su historial.
- Rechazo de una versión antigua con 409 CONFLICT.
- Conservación del responsable, versión e historial tras el rechazo.
- Ausencia de eventos duplicados al seleccionar al mismo responsable.
- Reasignación desde la interfaz web.
- Consulta del responsable después de recargar.
- Técnico anterior sin acceso al detalle: 404.
- Ticket ausente del listado del técnico anterior.
- Prueba automática de acceso del nuevo responsable.
- Prueba automática de rechazo de autoasignación.

## Pendientes para cierre

- Confirmar la política de disponibilidad operativa.
- Confirmar estados permitidos, transición automática y obligatoriedad
  del motivo con el equipo.
- Revisar el parámetro dueDate contra la regla de conservación del plazo.
- Completar la evidencia y validación final de QA.
- Corregir la descripción del ticket de prueba que contiene caracteres
  dañados desde la solicitud inicial de PowerShell.
- R- Rechazo de cambios de plazo durante la asignación, sin modificar
  el ticket ni su historial.
- Categoría inexistente rechazada con 400 VALIDATION_ERROR,
  comprobado contra PostgreSQL.
- La coordinación entre asignaciones y cambios de acceso del técnico
  utiliza una cola dentro de una instancia del servidor. La coordinación
  entre varias instancias requiere protección adicional en PostgreSQL.
- Los nombres de responsables históricos pueden mostrarse como Técnico #ID.
- Preparar commit y entrega una vez revisados los cambios.

## Estado

Implementación funcional disponible para revisión.
FR-007 permanece pendiente de cierre formal de reglas y QA.