-- Constraints e índices de integridad para el módulo tickets (NFR-010).
-- Requiere que 001_init.sql ya se haya aplicado (tabla `tickets` y `ticket_history`).

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Versionado optimista (control de concurrencia)
-- ──────────────────────────────────────────────────────────────────────────
-- Cada ticket tendrá un contador que se incrementa en cada UPDATE.
-- El cliente envía la versión actual; si no coincide, rechazamos con 409.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Reglas condicionales (nivel "Negocio")
-- ──────────────────────────────────────────────────────────────────────────
-- Si un ticket está en "Resolved", debe tener resolución.
ALTER TABLE tickets
  ADD CONSTRAINT tickets_resolved_requires_resolution
  CHECK (status <> 'Resolved' OR resolution IS NOT NULL);

-- Si un ticket está "Closed", debe tener closed_at.
ALTER TABLE tickets
  ADD CONSTRAINT tickets_closed_requires_closed_at
  CHECK (status <> 'Closed' OR closed_at IS NOT NULL);

-- Un ticket "Open" no puede tener técnico asignado.
ALTER TABLE tickets
  ADD CONSTRAINT tickets_open_requires_no_assignee
  CHECK (status <> 'Open' OR assigned_technician_id IS NULL);

-- Un ticket "Assigned" o posterior debe tener técnico.
ALTER TABLE tickets
  ADD CONSTRAINT tickets_assigned_requires_assignee
  CHECK (status NOT IN ('Assigned','In Progress','Resolved','Closed')
         OR assigned_technician_id IS NOT NULL);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Unicidad y consistencia de catálogos
-- ──────────────────────────────────────────────────────────────────────────
-- Los nombres de categorías y prioridades son únicos.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_categories_name_unique
  ON ticket_categories (name);

CREATE UNIQUE INDEX IF NOT EXISTS ticket_priorities_name_unique
  ON ticket_priorities (name);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Índices de rendimiento
-- ──────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_created_by
  ON tickets (created_by);

CREATE INDEX IF NOT EXISTS idx_tickets_category
  ON tickets (category_id);

CREATE INDEX IF NOT EXISTS idx_tickets_priority
  ON tickets (priority_id);

CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket
  ON ticket_history (ticket_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Seed de catálogos (idempotente)
-- ──────────────────────────────────────────────────────────────────────────
-- Categorías iniciales: coinciden con las de la situación actual (BR-003).
-- Nota: son provisionales y pueden cambiar tras confirmación del stakeholder (OI-004).
INSERT INTO ticket_categories (name)
VALUES ('Acceso'), ('Hardware'), ('Software'), ('Red')
ON CONFLICT (name) DO NOTHING;

-- Prioridades: coinciden con PRIORITIES de tickets.types.ts.
INSERT INTO ticket_priorities (name)
VALUES ('Low'), ('Medium'), ('High'), ('Critical')
ON CONFLICT (name) DO NOTHING;

COMMIT;