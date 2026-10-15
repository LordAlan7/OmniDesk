# FR-002 — Gestión de usuarios y técnicos

**Proyecto:** OmniDesk
**Responsable:** Mariana Nuñez de la Hoya
**Apoyo:** César Alexis Meza Martínez
**Validación QA:** Edgar Alan Meráz Casas
**Rama:** mariana

## Estado de entrega

Implementación y pruebas de desarrollo realizadas.
Pendiente de revisión y aprobación formal de QA.

## Alcance implementado

- Listado de cuentas con búsqueda, filtros por rol y estado, y paginación.
- Creación de usuarios con uno o varios roles.
- Consulta y edición de nombre, correo y roles.
- Confirmación para cambios de roles y activación o desactivación.
- Técnicos identificados mediante el rol Technician en la misma cuenta.
- Persistencia de usuarios y asociaciones de roles en PostgreSQL.
- Validación de campos, correos únicos y roles válidos sin duplicados.
- Contraseñas almacenadas como hash mediante bcrypt.
- Transacciones para altas y actualizaciones.
- Protección del último administrador activo.
- Autorización centralizada integrada con NFR-001.
- Navegación y acciones de Vue según permisos efectivos.
- Revisión de permisos en formularios antes de guardar, al recuperar
  el foco de la ventana y cada 30 segundos mientras están visibles.
- Retirada del formulario cuando se detecta pérdida de acceso.
- Conservación de campos ante errores ordinarios de guardado.
- Invalidación de sesiones al desactivar una cuenta.
- Registro de cambios administrativos mediante el módulo de auditoría.

Una cuenta activa no representa disponibilidad para recibir tickets.
La disponibilidad corresponde a FR-007.

## Tecnologías

Vue con TypeScript, Vue Router, Node.js, Express, PostgreSQL 17,
JWT, bcrypt, Zod, Jest, Supertest y Cypress.

## Requisitos locales

- Node.js compatible con las versiones indicadas en package.json.
- PostgreSQL 17.
- npm.
- Ejecutar los comandos desde la raíz del repositorio.

## Instalación

```powershell
git switch mariana
npm install
```

## Configuración del backend

Crear apps/api/.env:

```dotenv
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=REEMPLAZAR_CON_UN_SECRETO_LOCAL
JWT_EXPIRES_IN=8h
DATABASE_URL=postgresql://postgres:123456789@localhost:5432/omnidesk
OPENAI_API_KEY=
```

El archivo .env está excluido de Git.

Datos del entorno local de desarrollo:

| Dato | Valor |
|---|---|
| Servidor | localhost |
| Puerto | 5432 |
| Usuario PostgreSQL | postgres |
| Contraseña PostgreSQL local | 123456789 |
| Base de desarrollo | omnidesk |
| Base de pruebas | omnidesk_test |

Estos valores son de desarrollo local y no deben reutilizarse en producción.
Cada integrante debe ajustar la conexión a su instalación.

## Configuración del frontend

Crear apps/web/.env:

```dotenv
VITE_API_URL=http://localhost:3000/api/v1
```

## Preparación de PostgreSQL

Ejecutar estos comandos una sola vez para una base nueva:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -W -c "CREATE DATABASE omnidesk;"

& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -d omnidesk -W -v ON_ERROR_STOP=1 -f "apps/api/db/migrations/001_init.sql"

& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -d omnidesk -W -v ON_ERROR_STOP=1 -f "apps/api/db/migrations/002_users_constraints.sql"
```

Las tablas utilizadas por FR-002 son users, roles y user_roles.
La migración 002 incorpora los roles y la unicidad del correo normalizado.

## Cuentas de demostración

Preparar las cuentas:

```powershell
npm exec -w apps/api -- tsx src/scripts/seed-users.ts
```

El script conserva las cuentas existentes sin sobrescribirlas.

Contraseña inicial de las cuentas creadas por el script: `ChangeMe123!`.

| Correo | Rol |
|---|---|
| employee@company.com | Employee |
| technician@company.com | Technician |
| advisor@company.com | Service Advisor |
| manager@company.com | Manager |
| admin@company.com | Administrator |

Para administrar cuentas, entrar con admin@company.com.

La contraseña de la aplicación es independiente de la de PostgreSQL.

## Ejecución normal

En una terminal:

```powershell
$env:CORS_ORIGIN = "http://localhost:5173"
npm run dev:api
```

En otra terminal:

```powershell
npm run dev -w apps/web
```

- Aplicación: http://localhost:5173/login
- API: http://localhost:3000/api/v1
- Salud: http://localhost:3000/api/v1/health

La variable CORS_ORIGIN de la terminal tiene prioridad sobre el archivo .env.

## Pantallas

| Ruta | Función |
|---|---|
| /login | Inicio de sesión |
| /users | Listado, búsqueda, filtros y estado |
| /users/new | Creación de cuentas |
| /users/:id/edit | Consulta y edición |
| /access-denied | Acceso denegado o verificación no disponible |

## API

Todas las rutas utilizan el prefijo /api/v1.

| Método | Ruta | Operación |
|---|---|---|
| POST | /auth/login | Iniciar sesión |
| GET | /auth/me | Consultar identidad y permisos vigentes |
| POST | /auth/logout | Registrar cierre de sesión |
| GET | /roles | Consultar roles para formularios |
| GET | /users | Listar usuarios |
| GET | /users/:id | Consultar una cuenta |
| POST | /users | Crear una cuenta |
| PATCH | /users/:id | Actualizar datos, roles o estado |
| PUT | /users/:id/roles | Cambiar roles |

Ejemplo:

```text
/api/v1/users?search=demo&role=Technician&active=true&page=1&limit=10
```

Las rutas protegidas requieren Authorization: Bearer <TOKEN>.
Las respuestas públicas excluyen contraseñas y hashes.

## Matriz de permisos aplicada

Se reutiliza shared/authorization y la matriz de NFR-001.
Los permisos de varios roles se combinan mediante unión.

| Operación | Administrator | Manager | Service Advisor | Employee / Technician |
|---|---|---|---|---|
| Listar cuentas | Sí | Sí | Sí | No |
| Consultar detalle | Sí | Sí | No | No |
| Crear cuentas | Sí | No | No | No |
| Editar datos | Sí | No | No | No |
| Asignar roles | Sí | No | No | No |
| Activar o desactivar | Sí | No | No | No |

| Acción | Permiso |
|---|---|
| Listar | users:read:list |
| Consultar detalle | users:read |
| Crear | users:create y users:assign:roles |
| Editar nombre o correo | users:update |
| Cambiar roles | users:assign:roles |
| Activar o desactivar | users:deactivate |
| Consultar catálogo de roles | users:assign:roles |

Un PATCH con varios tipos de campos exige todos los permisos correspondientes.
El formulario de edición actual requiere lectura, actualización y asignación
de roles. Ocultar acciones en Vue no sustituye la protección del backend.

## Reglas administrativas

- Nombre de 2 a 120 caracteres.
- Correo válido, normalizado y único.
- Contraseña inicial de 10 a 128 caracteres.
- Uno o varios roles válidos, sin asociaciones duplicadas.
- Rechazo de campos no permitidos.
- No se elimina la cuenta al desactivarla.
- Se impide desactivar o retirar el rol al último administrador activo.
- Se bloquea la desactivación o retirada del rol Technician cuando existen
  tickets asignados cuyo estado sea distinto de Closed.
- Un ticket Resolved todavía bloquea esas operaciones hasta su cierre.
- No se reasignan ni cierran tickets automáticamente.
- Se conservan las referencias históricas a la cuenta.

La protección frente a cambios concurrentes del último administrador utiliza
una transacción y bloqueos en PostgreSQL.

## Sesiones y permisos

- Cada solicitud protegida comprueba el estado y los roles actuales.
- Desactivar bloquea nuevos inicios de sesión e invalida los tokens anteriores.
- Reactivar permite iniciar una sesión nueva sin restaurar tokens invalidados.
- Los cambios de rol afectan los permisos de sesiones existentes.
- /auth/me utiliza Cache-Control: no-store.
- Las versiones de sesión están en memoria; reiniciar la API exige nuevo login.
- El cierre de sesión de la interfaz descarta el token del cliente.
- La ruta de logout registra la acción; no revoca por sí sola el token.

## Pruebas verificadas durante el desarrollo

| Grupo | Resultado |
|---|---|
| Jest y Supertest: API, autorización y arquitectura | 56 aprobadas |
| Integración del repositorio con PostgreSQL real | 6 aprobadas |
| Cypress: flujos de interfaz | 5 aprobadas |
| TypeScript del backend y frontend | Sin errores |
| Compilación del frontend | Correcta |

Los resultados corresponden a ejecuciones separadas.

Las pruebas generales usan el repositorio en memoria.
Las seis pruebas de integración utilizan PostgreSQL real y un esquema temporal.

### Comprobaciones de PostgreSQL

- Lectura de usuarios y roles desde otra conexión.
- Rechazo de correos duplicados normalizados.
- Rechazo de roles inexistentes sin crear cuentas parciales.
- Reversión de cambios ante un error.
- Persistencia de datos, roles y estado.
- Conservación de un administrador activo ante desactivaciones concurrentes.

### Flujos de Cypress

1. Crear un técnico, recargar, filtrar, desactivar y reactivar.
2. Consulta de gerente sin acciones administrativas.
3. Protección del listado sin sesión.
4. Edición de datos y roles, error de guardado, reintento y persistencia.
5. Retirada del formulario abierto al recibir permisos revocados.

La quinta prueba simula la respuesta de permisos sin modificar la cuenta
administradora real. Las pruebas de API cubren cambios efectivos de roles.

## Ejecutar comprobaciones generales

```powershell
npm run typecheck
npm run test:api
npm run type-check -w apps/web
npm run build -w apps/web
```

Sin TEST_DATABASE_URL, las pruebas de integración PostgreSQL se omiten.

## Ejecutar integración PostgreSQL

Crear una sola vez la base de pruebas:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -W -c "CREATE DATABASE omnidesk_test;"
```

La prueba crea su esquema temporal y aplica ambas migraciones automáticamente.
No necesita tablas preparadas previamente en el esquema public.

```powershell
$env:TEST_DATABASE_URL = node --env-file=apps/api/.env -e "const url = new URL(process.env.DATABASE_URL); url.pathname = '/omnidesk_test'; console.log(url.toString());"

try {
    npm test -w apps/api -- --runInBand --runTestsByPath src/modules/users/users.postgres.integration.test.ts
} finally {
    Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
}
```

El esquema temporal se elimina al terminar.
La prueba exige que la base se llame omnidesk_test.

## Ejecutar Cypress

Instalar y verificar el ejecutable si es necesario:

```powershell
Remove-Item Env:CYPRESS_INSTALL_BINARY -ErrorAction SilentlyContinue
npm exec -w apps/web -- cypress install
npm exec -w apps/web -- cypress verify
npm run build -w apps/web
```

Detener cualquier API anterior que use el puerto 3000.

Terminal 1:

```powershell
$env:CORS_ORIGIN = "http://localhost:4173"
npm run dev:api
```

Terminal 2:

```powershell
npm run preview -w apps/web -- --port 4173 --strictPort
```

Terminal 3:

```powershell
npm exec -w apps/web -- cypress run --e2e --spec cypress/e2e/users.cy.ts
```

La API debe permitir el origen http://localhost:4173.
Las pruebas crean cuentas identificables de Cypress en la base de desarrollo.

El archivo example.cy.ts generado por Vue conserva una prueba de bienvenida
que no corresponde a OmniDesk. El comando anterior ejecuta únicamente users.cy.ts.

## Límites de la implementación actual

- La persistencia migrada corresponde a usuarios y roles.
- Tickets y auditoría conservan su almacenamiento en memoria.
- Reiniciar la API elimina los tickets y registros de auditoría en memoria.
- La comprobación de tickets pendientes consulta ese almacenamiento actual.
- La coordinación entre asignaciones y cambios de acceso del técnico utiliza
  un bloqueo en memoria, válido para una sola instancia de la API.
- Las sesiones requieren una solución compartida antes de ejecutar varias
  instancias del backend.
- La disponibilidad operativa del técnico corresponde a FR-007.
- No se implementaron invitaciones por correo ni recuperación de contraseña.

## Entrega a QA

Edgar debe revisar los criterios de aceptación, confirmar las políticas
administrativas y registrar su aprobación o los hallazgos.

Las pruebas aprobadas de desarrollo no sustituyen la validación formal de QA.