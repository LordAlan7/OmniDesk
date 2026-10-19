# Validaciones e integridad de datos (NFR-010)

Este documento es la **referencia humana** del diccionario de validación.
La fuente de verdad en código es
[`apps/api/src/shared/validation/validationRules.ts`](../apps/api/src/shared/validation/validationRules.ts).

- **Niveles cubiertos:** campo, relación, negocio, operación, concurrencia.
- **Fuente de verdad:** zod (schemas) + PostgreSQL (constraints).
- **Denegación por defecto:** rechazamos lo inválido antes de tocar datos.

---

## 1. Nivel "Campo" — Tipos, formatos, obligatoriedad, longitud

| Entidad | Campo | Tipo | Obligatorio | Longitud | Notas |
|---|---|---|---|---|---|
| User | name | string | ✅ | 2–120 | trim |
| User | email | string | ✅ | 5–254 | trim + lowercase + formato email |
| User | password | string | ✅ | 10–128 | solo en creación, nunca se devuelve |
| User | roles | array | ✅ | ≥1, sin duplicados | valores del catálogo `ROLES` |
| Ticket | title | string | ✅ | 3–200 | trim |
| Ticket | description | string | ✅ | 1–5000 | trim |
| Ticket | categoryId | number | ✅ | entero positivo | referencia a categoría existente |
| Ticket | priorityId | number | ❌ | entero del catálogo `PRIORITIES` | solo Manager puede cambiarla |
| Ticket | status | string | ✅ | enum `TICKET_STATUSES` | transiciones controladas |
| Ticket | version | number | ✅ (al editar) | entero positivo | requerido en `PATCH` para evitar colisiones |
| Ticket | resolution | string | ❌ (✅ si Resolved) | 5–5000 | trim |
| Ticket | comment | string | ❌ | 0–1000 | solo al cerrar |

**`.strict()` en todos los schemas.** Los campos no declarados se rechazan
para evitar inyección de campos reservados.

---

## 2. Nivel "Relación" — Referencias y asociaciones

| Relación | Regla | Estado |
|---|---|---|
| `users.email` | UNIQUE case-insensitive + trim | ✅ `002_users_constraints.sql` |
| `tickets.category_id` | FK a `ticket_categories.id` | ✅ `003_tickets_constraints.sql` |
| `tickets.priority_id` | FK a `ticket_priorities.id` | ✅ `003_tickets_constraints.sql` |
| `tickets.created_by` | FK a `users.id` | ✅ `003_tickets_constraints.sql` |
| `tickets.assigned_technician_id` | FK a `users.id` | ✅ `003_tickets_constraints.sql` |
| `ticket_history.ticket_id` | FK a `tickets.id` | ✅ `003_tickets_constraints.sql` |
| `ticket_history.actor_id` | FK a `users.id` | ✅ `003_tickets_constraints.sql` |
| `audit_log.actor_id` | FK a `users.id` (nullable) | ✅ `004_audit_constraints.sql` |
| Técnico asignado | Debe tener rol `Technician` y estar activo | ✅ `isActiveTechnician()` |

---

## 3. Nivel "Negocio" — Estados, roles, combinaciones

### Tickets — máquina de estados (ya existente)

### Reglas condicionales (Constraints en PostgreSQL)

| Regla | Dónde se aplica | Estado |
|---|---|---|
| `status = "Resolved"` → `resolution` no null | `003_tickets_constraints.sql` + `tickets.lifecycle.ts` | ✅ Implementado |
| `status = "Closed"` → `closedAt` no null | `003_tickets_constraints.sql` + `tickets.lifecycle.ts` | ✅ Implementado |
| `status = "Open"` → `assignedTechnicianId` null | `003_tickets_constraints.sql` + `tickets.lifecycle.ts` | ✅ Implementado |
| `status = "Assigned"` → `assignedTechnicianId` no null | `003_tickets_constraints.sql` + `tickets.lifecycle.ts` | ✅ Implementado |
| Técnico con tickets pendientes no puede desactivarse | `users.lifecycle.ts` | ✅ Implementado |
| No se puede reclasificar un ticket cerrado | `tickets.lifecycle.ts` | ✅ Implementado |

### Roles válidos

Solo valores de `ROLES` del sistema (`Employee`, `Technician`,
`Service Advisor`, `Manager`, `Administrator`). Se valida vía
`z.enum(ROLES)`.

---

## 4. Nivel "Operación" — Transacciones

| Operación | Debe ser atómica | Estado |
|---|---|---|
| Crear ticket + history + audit | ✅ | ✅ `tickets.postgres.repository.ts` |
| Asignar técnico + history + audit + notify | ✅ | ✅ `tickets.service.ts` |
| Resolver ticket + history + audit | ✅ | ✅ `tickets.service.ts` |
| Cambiar rol + audit | ✅ | ✅ `users.postgres.repository.ts` |

Las transacciones se manejan con `BEGIN/COMMIT/ROLLBACK` en los repositorios PostgreSQL.

---

## 5. Nivel "Concurrencia" — Race conditions

| Escenario | Solución actual | Estado |
|---|---|---|
| Desactivar técnico con tickets pendientes (concurrente) | Cola por usuario en memoria (`withTechnicianLifecycleLock`) | ✅ `users.lifecycle.ts` |
| Crear usuario con email duplicado (concurrente) | UNIQUE index en PostgreSQL | ✅ `002_users_constraints.sql` |
| Editar ticket desde 2 pestañas | Versionado optimista (campo `version` en el schema) | ✅ `tickets.schemas.ts` + `tickets.service.ts` |

---

## 6. Decisiones asumidas vs pendientes

### Asumidas por el equipo (derivadas del código actual)

- ✅ Email case-insensitive y trimmeado.
- ✅ Contraseña mínimo 10 caracteres.
- ✅ Título de ticket mínimo 3 caracteres.
- ✅ Reglas condicionales de tickets (derivadas de la máquina de estados).
- ✅ Técnico con tickets pendientes no se puede desactivar.
- ✅ Solo Service Advisor y Manager pueden reclasificar tickets.
- ✅ No se permite reclasificar tickets cerrados.
- ✅ El catálogo inicial de categorías es: Acceso, Hardware, Software, Red.

### Pendientes de confirmación con el stakeholder

- ⚠️ Categorías exactas de tickets (OI-004).
- ⚠️ Niveles y criterios de prioridad (OI-005).
- ⚠️ Documentos autorizados como fuente de IA (OI-007).
- ⚠️ ¿Se permiten tickets duplicados? (no hay regla de unicidad en `title`).
- ⚠️ ¿Los usuarios eliminados deben conservar sus tickets históricos? (ON DELETE).

---

## 7. Referencias

- **NFR-010** — Data Integrity (requerimiento de origen).
- **NFR-009** — Traceability and Auditability (audit log).
- **FR-002 a FR-012** — Reglas de negocio por módulo.
- **A5 – Software Solution Architecture and Design**, sección "Data design".
- **001_init.sql** — Esquema PostgreSQL base.
- **002_users_constraints.sql** — Constraints de users (Mariana).
- **003_tickets_constraints.sql** — Constraints de tickets (Edgar).
- **004_audit_constraints.sql** — FK para audit_log (Edgar).