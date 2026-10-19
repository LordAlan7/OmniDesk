# Validaciones e integridad de datos (NFR-010)

Este documento es la **referencia humana** del diccionario de validación.
La fuente de verdad en código es
[`apps/api/src/shared/validation/validationRules.ts`](../apps/api/src/shared/validation/validationRules.ts).

- **Niveles cubiertos:** campo, relación, negocio, operación, concurrencia.
- **Fuente de verdad:** zod (schemas) + PostgreSQL (constraints).
- **Denegación por defecto:** rechazamos lo inválido antes de tocar datos.

---

## 1. Nivel "Campo" — Tipos, formatos, obligatoriedad, longitud

| Entidad | Campo       | Tipo   | Obligatorio         | Longitud                         | Notas                               |
| ------- | ----------- | ------ | ------------------- | -------------------------------- | ----------------------------------- |
| User    | name        | string | ✅                  | 2–120                            | trim                                |
| User    | email       | string | ✅                  | 5–254                            | trim + lowercase + formato email    |
| User    | password    | string | ✅                  | 10–128                           | solo en creación, nunca se devuelve |
| User    | roles       | array  | ✅                  | ≥1, sin duplicados               | valores del catálogo `ROLES`        |
| Ticket  | title       | string | ✅                  | 3–200                            | trim                                |
| Ticket  | description | string | ✅                  | 1–5000                           | trim                                |
| Ticket  | categoryId  | number | ✅                  | entero positivo                  | referencia a categoría existente    |
| Ticket  | priorityId  | number | ❌                  | entero del catálogo `PRIORITIES` | solo Manager puede cambiarla        |
| Ticket  | status      | string | ✅                  | enum `TICKET_STATUSES`           | transiciones controladas            |
| Ticket  | resolution  | string | ❌ (✅ si Resolved) | 5–5000                           | trim                                |
| Ticket  | comment     | string | ❌                  | 0–1000                           | solo al cerrar                      |

**`.strict()` en todos los schemas.** Los campos no declarados se rechazan
para evitar inyección de campos reservados.

---

## 2. Nivel "Relación" — Referencias y asociaciones

| Relación                         | Regla                                      | Estado                                |
| -------------------------------- | ------------------------------------------ | ------------------------------------- |
| `users.email`                    | UNIQUE case-insensitive + trim             | ✅ `002_users_constraints.sql`        |
| `tickets.category_id`            | FK a `ticket_categories.id`                | ⏳ pendiente (tickets aún en memoria) |
| `tickets.priority_id`            | FK a `ticket_priorities.id`                | ⏳ pendiente                          |
| `tickets.created_by`             | FK a `users.id`                            | ⏳ pendiente                          |
| `tickets.assigned_technician_id` | FK a `users.id`                            | ⏳ pendiente                          |
| `ticket_history.ticket_id`       | FK a `tickets.id`                          | ⏳ pendiente                          |
| `ticket_history.actor_id`        | FK a `users.id`                            | ⏳ pendiente                          |
| `audit_log.actor_id`             | FK a `users.id` (nullable)                 | ⏳ pendiente                          |
| Técnico asignado                 | Debe tener rol `Technician` y estar activo | ✅ `isActiveTechnician()`             |

---

## 3. Nivel "Negocio" — Estados, roles, combinaciones

### Tickets — máquina de estados (ya existente)
