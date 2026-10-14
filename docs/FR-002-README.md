# FR-002 — Gestión de usuarios y técnicos

**Proyecto:** OmniDesk  
**Responsable:** Mariana Nuñez de la Hoya  
**Rama de trabajo:** `mariana`

## Descripción

Módulo para administrar cuentas de empleados y técnicos: consultar,
crear, editar, asignar roles y activar o desactivar su acceso.

Utiliza Vue con TypeScript, Node.js/Express y PostgreSQL.
Integra los controles de autorización de NFR-001 desde la rama `edgar`.

## Funcionalidades implementadas

- Inicio de sesión administrativo.
- Listado de usuarios y técnicos.
- Búsqueda por nombre o correo electrónico.
- Filtros por rol y estado.
- Paginación.
- Creación de cuentas con uno o varios roles.
- Consulta y edición de nombre, correo y roles.
- Confirmación antes de modificar roles o estado.
- Activación y desactivación sin eliminar la cuenta.
- Protección del último administrador activo.
- Consulta de roles desde la API.
- Contraseñas almacenadas como hash mediante bcrypt.
- Validación de correos únicos y roles válidos.
- Persistencia de cuentas y roles en PostgreSQL.
- Transacciones para crear y actualizar usuarios.
- Comprobación del estado y los roles actuales en solicitudes protegidas.
- Invalidación de sesiones al desactivar cuentas.
- Indicadores de carga, mensajes de error y confirmaciones de éxito.

Un técnico utiliza una cuenta de usuario con el rol `Technician`.
El estado activo no representa disponibilidad para recibir tickets.

## Tecnologías

- Vue y TypeScript.
- Vue Router.
- Node.js y Express.
- PostgreSQL 17.
- JWT y bcrypt.
- Zod.
- Jest y Supertest.
- Cypress configurado en el frontend; ejecución pendiente.

## Configuración local de PostgreSQL

Estos datos corresponden exclusivamente al entorno local de desarrollo:

| Dato | Valor |
|---|---|
| Servidor | localhost |
| Puerto | 5432 |
| Base de datos | omnidesk |
| Usuario | postgres |
| Contraseña local | 123456789 |

No utilizar esta contraseña en producción ni en servicios expuestos.
Si este README se comparte, la contraseña deja de ser privada.

## Instalación de dependencias

Desde la raíz del repositorio:

```powershell
git switch mariana
npm install
```

## Variables de entorno

### Backend: `apps/api/.env`

```env
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=REEMPLAZAR_CON_UN_SECRETO_LOCAL
JWT_EXPIRES_IN=8h
DATABASE_URL=postgresql://postgres:123456789@localhost:5432/omnidesk
OPENAI_API_KEY=
```

Definir un valor local para `JWT_SECRET`.

El archivo `.env` está excluido de Git y no debe subirse al repositorio.

### Frontend: `apps/web/.env`

```env
VITE_API_URL=http://localhost:3000/api/v1
```

## Preparación de la base de datos

Los siguientes comandos utilizan la instalación predeterminada de
PostgreSQL 17 en Windows.

### Crear la base de datos

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -W -c "CREATE DATABASE omnidesk;"
```

Cuando solicite la contraseña, introducir la contraseña local de PostgreSQL.

### Ejecutar el esquema inicial

Ejecutar una vez en una base nueva:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -d omnidesk -W -v ON_ERROR_STOP=1 -f "apps/api/db/migrations/001_init.sql"
```

### Ejecutar la migración de usuarios

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -d omnidesk -W -v ON_ERROR_STOP=1 -f "apps/api/db/migrations/002_users_constraints.sql"
```

Esta migración incorpora los roles y un índice único para el correo
normalizado.

### Tablas utilizadas

- `users`: cuentas, estado y hash de contraseña.
- `roles`: catálogo de roles.
- `user_roles`: asociaciones de usuarios y roles.

## Crear cuentas de demostración

Desde la raíz del proyecto:

```powershell
npm exec -w apps/api -- tsx src/scripts/seed-users.ts
```

El script funciona únicamente en desarrollo y conserva las cuentas
existentes sin sobrescribirlas.

## Usuarios y contraseñas de demostración

La contraseña inicial de todas las cuentas creadas por el script es:

```text
ChangeMe123!
```

| Correo de acceso | Rol | Contraseña inicial |
|---|---|---|
| employee@company.com | Employee | ChangeMe123! |
| technician@company.com | Technician | ChangeMe123! |
| advisor@company.com | Service Advisor | ChangeMe123! |
| manager@company.com | Manager | ChangeMe123! |
| admin@company.com | Administrator | ChangeMe123! |

Estas cuentas son exclusivamente de demostración.

### Acceso a la administración

```text
Correo: admin@company.com
Contraseña: ChangeMe123!
```

La contraseña de OmniDesk es diferente de la contraseña de PostgreSQL.

## Ejecutar la aplicación

Abrir dos terminales desde la raíz del repositorio.

### Backend

```powershell
npm run dev:api
```

API: http://localhost:3000/api/v1

Comprobación del servicio:

http://localhost:3000/api/v1/health

### Frontend

```powershell
npm run dev -w apps/web
```

Aplicación:

http://localhost:5173

Inicio de sesión:

http://localhost:5173/login

## Pantallas

| Ruta | Función |
|---|---|
| `/login` | Inicio de sesión |
| `/users` | Listado, búsqueda y filtros |
| `/users/new` | Creación de cuentas |
| `/users/:id/edit` | Consulta y edición |

## API

Todas las rutas utilizan el prefijo `/api/v1`.

| Método | Ruta | Operación |
|---|---|---|
| POST | `/auth/login` | Iniciar sesión |
| GET | `/auth/me` | Consultar perfil actual |
| POST | `/auth/logout` | Registrar cierre de sesión |
| GET | `/roles` | Consultar roles para formularios |
| GET | `/users` | Listar usuarios |
| GET | `/users/:id` | Consultar una cuenta |
| POST | `/users` | Crear una cuenta |
| PATCH | `/users/:id` | Actualizar datos, roles o estado |
| PUT | `/users/:id/roles` | Actualizar únicamente roles |

Ejemplo de búsqueda y filtros:

```text
/api/v1/users?search=demo&role=Technician&active=true&page=1&limit=10
```

Las solicitudes protegidas requieren:

```text
Authorization: Bearer <TOKEN>
```

## Control de permisos

Se reutiliza la autorización centralizada de NFR-001.

| Acción | Permiso |
|---|---|
| Listar usuarios | `users:read:list` |
| Consultar una cuenta | `users:read` |
| Crear una cuenta | `users:create` y `users:assign:roles` |
| Editar nombre o correo | `users:update` |
| Cambiar roles | `users:assign:roles` |
| Activar o desactivar | `users:deactivate` |
| Consultar roles para formularios | `users:assign:roles` |

Si un PATCH modifica varios tipos de campos, se comprueban todos los
permisos correspondientes antes de guardar.

Los permisos de usuarios con varios roles se combinan mediante unión,
según la matriz integrada.

La interfaz administrativa actualmente permite entrar a cuentas con
rol `Administrator`. La adaptación visual para otros roles con permisos
de consulta sigue pendiente.

## Validaciones

- Nombre de 2 a 120 caracteres.
- Correo válido, normalizado y único.
- Contraseña inicial de 10 a 128 caracteres.
- Al menos un rol válido y sin duplicados.
- Rechazo de campos no permitidos.
- Protección del último administrador activo.
- Exclusión de contraseñas y hashes en respuestas públicas.

## Sesiones

- El servidor consulta el estado y los roles actuales de la cuenta.
- Desactivar una cuenta bloquea nuevos inicios de sesión e invalida
  sus tokens anteriores.
- Reactivar permite iniciar una sesión nueva, sin recuperar tokens
  invalidados.
- Las versiones de sesión están en memoria: reiniciar el backend
  requiere iniciar sesión nuevamente.
- El cierre de sesión actual descarta el token en el cliente; la ruta
  de logout registra la acción.

## Verificación

Comandos utilizados:

```powershell
npm run typecheck
npm run test:api
npm run type-check -w apps/web
```

Se reportaron 43 pruebas de backend aprobadas y comprobaciones de
TypeScript sin errores.

Las pruebas actuales utilizan cuentas en memoria; no sustituyen las
pruebas de integración con PostgreSQL.

### Comprobaciones manuales realizadas

- Inicio de sesión administrativo.
- Creación y consulta de usuarios.
- Búsqueda y filtros.
- Edición de nombre, correo y roles.
- Activación y desactivación.
- Protección del último administrador.
- Invalidación de tokens después de desactivar y reactivar.
- Conservación de usuarios después de reiniciar el backend.
- Conservación del nombre y roles editados después del reinicio.

## Pendientes para cerrar FR-002

- Definir y aplicar la política para técnicos con tickets pendientes.
- Adaptar navegación y acciones de Vue a los permisos efectivos.
- Agregar pruebas específicas de gestión de usuarios.
- Agregar pruebas de integración con PostgreSQL.
- Instalar el ejecutable de Cypress y ejecutar los flujos completos.
- Preparar evidencias y documentación para validación QA.

La persistencia implementada corresponde a usuarios y roles.
Los demás módulos conservan su almacenamiento actual.