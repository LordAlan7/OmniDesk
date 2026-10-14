# Autorización de OmniDesk (NFR-001)

Este documento es la **referencia humana** de la matriz de autorización del sistema.
La fuente de verdad en código es [`apps/api/src/shared/authorization/rolePermissions.ts`](../apps/api/src/shared/authorization/rolePermissions.ts).

- **Autenticación:** JWT Bearer (FR-001). Middleware: `authenticate`.
- **Autorización:** RBAC basado en roles + verificación de propiedad/asignación sobre el recurso.
- **Regla por defecto:** **denegación por defecto.** Lo que no esté explícitamente permitido, se rechaza.
- **Combinación de roles múltiples:** **unión** de permisos (si un usuario tiene Employee + Technician, recibe todo lo de ambos).

---

## 1. Roles del sistema

| Rol               | Descripción operativa                                                                |
| ----------------- | ------------------------------------------------------------------------------------ |
| `Employee`        | Empleado que reporta problemas y sigue sus propios tickets (FR-018).                 |
| `Technician`      | Técnico que investiga, da seguimiento y resuelve los tickets que le son asignados.   |
| `Service Advisor` | Asesor que asigna/reasigna tickets y cierra los resueltos.                           |
| `Manager`         | Gerente que prioriza tickets, consulta métricas y revisa reportes.                   |
| `Administrator`   | Administra cuentas, roles y acceso. **No realiza trabajo de negocio sobre tickets.** |

---

## 2. Matriz de autorización

✅ = permitido · ❌ = denegado por defecto (no listado en la matriz)

### 2.1 Usuarios (`users:*`)

| Permiso              | Employee | Technician | Service Advisor | Manager | Administrator |
| -------------------- | -------- | ---------- | --------------- | ------- | ------------- |
| `users:create`       | ❌       | ❌         | ❌              | ❌      | ✅            |
| `users:read`         | ❌       | ❌         | ❌              | ✅      | ✅            |
| `users:read:list`    | ❌       | ❌         | ✅              | ✅      | ✅            |
| `users:update`       | ❌       | ❌         | ❌              | ❌      | ✅            |
| `users:deactivate`   | ❌       | ❌         | ❌              | ❌      | ✅            |
| `users:assign:roles` | ❌       | ❌         | ❌              | ❌      | ✅            |

> **Nota:** `users:read:list` está permitido para `Service Advisor` y `Manager` porque lo necesitan para elegir técnicos al asignar tickets.

### 2.2 Tickets (`tickets:*`)

| Permiso                   | Employee | Technician | Service Advisor | Manager | Administrator |
| ------------------------- | -------- | ---------- | --------------- | ------- | ------------- |
| `tickets:create`          | ✅       | ✅         | ✅              | ❌      | ❌            |
| `tickets:read`            | ✅       | ✅         | ✅              | ✅      | ✅            |
| `tickets:read:all`        | ❌       | ❌         | ✅              | ✅      | ❌            |
| `tickets:update`          | ❌       | ✅         | ✅              | ❌      | ❌            |
| `tickets:assign`          | ❌       | ❌         | ✅              | ❌      | ❌            |
| `tickets:priority:update` | ❌       | ❌         | ❌              | ✅      | ❌            |
| `tickets:status:update`   | ❌       | ✅         | ✅              | ❌      | ❌            |
| `tickets:resolve`         | ❌       | ✅         | ❌              | ❌      | ❌            |
| `tickets:close`           | ❌       | ❌         | ✅              | ✅      | ❌            |
| `tickets:history:read`    | ❌       | ✅         | ✅              | ✅      | ✅            |

### 2.3 Conocimiento (`knowledge:*`)

| Permiso             | Employee | Technician | Service Advisor | Manager | Administrator |
| ------------------- | -------- | ---------- | --------------- | ------- | ------------- |
| `knowledge:read`    | ✅       | ✅         | ✅              | ✅      | ✅            |
| `knowledge:create`  | ❌       | ✅         | ✅              | ✅      | ❌            |
| `knowledge:update`  | ❌       | ✅         | ✅              | ✅      | ❌            |
| `knowledge:publish` | ❌       | ❌         | ❌              | ✅      | ❌            |

### 2.4 Asistente de IA (`ai:*`)

| Permiso       | Employee | Technician | Service Advisor | Manager | Administrator |
| ------------- | -------- | ---------- | --------------- | ------- | ------------- |
| `ai:query`    | ✅       | ✅         | ✅              | ✅      | ✅            |
| `ai:validate` | ❌       | ✅         | ✅              | ✅      | ❌            |

### 2.5 Reportes (`reports:*`)

| Permiso               | Employee | Technician | Service Advisor | Manager | Administrator |
| --------------------- | -------- | ---------- | --------------- | ------- | ------------- |
| `reports:read`        | ❌       | ❌         | ✅              | ✅      | ❌            |
| `reports:read:global` | ❌       | ❌         | ❌              | ✅      | ❌            |

### 2.6 Auditoría (`audit:*`)

| Permiso      | Employee | Technician | Service Advisor | Manager | Administrator |
| ------------ | -------- | ---------- | --------------- | ------- | ------------- |
| `audit:read` | ❌       | ❌         | ❌              | ✅      | ✅            |

### 2.7 Notificaciones (`notifications:*`)

| Permiso                    | Employee | Technician | Service Advisor | Manager | Administrator |
| -------------------------- | -------- | ---------- | --------------- | ------- | ------------- |
| `notifications:read:own`   | ✅       | ✅         | ✅              | ✅      | ✅            |
| `notifications:update:own` | ✅       | ✅         | ✅              | ✅      | ✅            |

> **Nota:** las notificaciones se filtran por `userId`, así que cada usuario solo accede a las suyas independientemente del rol.

---

## 3. Reglas de alcance sobre recursos (Nivel "Registro")

Los permisos de la sección 2 deciden **si** el usuario puede ejecutar una operación. Pero además, cuando la operación es sobre un ticket concreto, se aplican reglas de **propiedad o asignación**:

| Rol               | Regla de visibilidad sobre un ticket                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `Employee`        | Solo si `ticket.createdBy === user.id` (FR-018).                                        |
| `Technician`      | Solo si `ticket.assignedTechnicianId === user.id` **o** `ticket.createdBy === user.id`. |
| `Service Advisor` | Todos los tickets (`tickets:read:all`).                                                 |
| `Manager`         | Todos los tickets (`tickets:read:all`).                                                 |
| `Administrator`   | **Solo si es el creador** del ticket. Para auditar, usa `audit:read`.                   |

**Respuesta al acceso denegado:** se devuelve **404 Not Found**, no 403, para no revelar la existencia de tickets ajenos.

---

## 4. Separación de deberes

La matriz está diseñada para evitar que un solo rol concentre poder excesivo:

- **`Administrator`** puede gestionar usuarios y ver el audit log, pero **no puede crear, asignar, priorizar, resolver ni cerrar tickets**. Su trabajo es administrativo, no operativo.
- **`Manager`** puede priorizar tickets y consultar métricas, pero **no puede asignar ni resolver**. Delega esas tareas a Advisor y Technician respectivamente.
- **`Service Advisor`** puede asignar y cerrar tickets, pero **no puede cambiar la prioridad**. Esa decisión queda en el Manager.
- **`Technician`** puede resolver sus tickets asignados, pero **no puede cerrar**. El cierre es responsabilidad del Advisor (quien verifica la solución).

---

## 5. Combinación de roles múltiples

Si un usuario tiene varios roles, sus permisos efectivos son la **unión** de los permisos de cada rol.

**Ejemplo:** un usuario con `Employee + Technician` puede:

- Crear tickets (`tickets:create`, del rol Employee).
- Resolver los tickets asignados (`tickets:resolve`, del rol Technician).
- Ver el historial de sus tickets (`tickets:history:read`, del rol Technician).

Pero **no** puede asignar tickets, porque ninguno de sus roles tiene `tickets:assign`.

---

## 6. Implementación

### Ubicación

- **Catálogo de permisos:** [`shared/authorization/permissions.ts`](../apps/api/src/shared/authorization/permissions.ts)
- **Matriz rol → permisos:** [`shared/authorization/rolePermissions.ts`](../apps/api/src/shared/authorization/rolePermissions.ts)
- **Motor de decisión:** [`shared/authorization/policy.ts`](../apps/api/src/shared/authorization/policy.ts)
- **Middleware Express:** [`shared/authorization/requirePermission.ts`](../apps/api/src/shared/authorization/requirePermission.ts)
- **Sanitización de respuestas:** [`shared/authorization/sanitize.ts`](../apps/api/src/shared/authorization/sanitize.ts)

### Uso

**En un router (middleware):**

```typescript
usersRouter.post(
  "/users",
  authenticate,
  requirePermission(PERMISSIONS.USERS_CREATE),
  handler,
);
```
