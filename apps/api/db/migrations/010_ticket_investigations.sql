-- FR-009: Investigación, resolución y cierre de tickets.
-- Requiere: 001_init.sql (tickets, ticket_history), 003_tickets_constraints.sql (version),
--           004_ticket_assignment.sql (ticket_history.reason), 006_knowledge_articles.sql (support_knowledge_articles).
-- Idempotente.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Tabla de actividades de investigación (FR-009)
-- ──────────────────────────────────────────────────────────────────────────
-- Cada registro es una actividad o prueba realizada por un técnico, su resultado,
-- autor y fecha. El contenido narrado vive aquí; el historial del ticket solo
-- registra el evento "investigation_logged" (texto libre NFR-009: valuesInAudit=false).
--
-- Defensa contra inyección SQL (NFR-002): las consultas que escriben/leen esta
-- tabla usan SIEMPRE parámetros ($1, $2, ...) con el driver pg. Ninguna entrada
-- del usuario se concatena en SQL. Los CHECK de longitud a nivel DB son una
-- segunda capa de defensa por si la validación zod se omite.
CREATE TABLE IF NOT EXISTS ticket_investigations (
  id                    SERIAL PRIMARY KEY,
  ticket_id             INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id             INT NOT NULL REFERENCES users(id),
  activity              TEXT NOT NULL CHECK (length(btrim(activity)) BETWEEN 1 AND 5000),
  result                TEXT NOT NULL CHECK (length(btrim(result)) BETWEEN 1 AND 5000),
  -- Referencia opcional a un artículo de conocimiento (FR-011) utilizado como apoyo.
  -- ON DELETE RESTRICT: si el artículo ya se usó en una investigación/resolución,
  -- NO se puede borrar. Para sacarlo de circulación se retira con status='retired'
  -- vía FR-011 (conserva el registro y la trazabilidad).
  -- La validez del estado "approved" al momento de GUARDAR se verifica en la app.
  knowledge_article_id  INT REFERENCES support_knowledge_articles(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_investigations_ticket
  ON ticket_investigations (ticket_id, id);

CREATE INDEX IF NOT EXISTS idx_ticket_investigations_author
  ON ticket_investigations (author_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Resolución ampliada del ticket (FR-009)
-- ──────────────────────────────────────────────────────────────────────────
-- `resolution` ya existe (TEXT). Añadimos los campos complementarios pedidos:
--   - comprobación del resultado (obligatorio al resolver, en la app)
--   - causa identificada (opcional: no se obliga al técnico a inventarla)
--   - observaciones (opcional)
--   - referencia opcional a un artículo de conocimiento utilizado en la solución
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS resolution_verification TEXT,
  ADD COLUMN IF NOT EXISTS root_cause              TEXT,
  ADD COLUMN IF NOT EXISTS resolution_observations TEXT,
  ADD COLUMN IF NOT EXISTS knowledge_article_id    INT REFERENCES support_knowledge_articles(id) ON DELETE RESTRICT;

-- Restricción condicional (NFR-010): si está resuelto, debe tener comprobación del resultado.
-- `resolution` ya está cubierto por tickets_resolved_requires_resolution.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_resolved_requires_verification'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_resolved_requires_verification
      CHECK (status <> 'Resolved' OR resolution_verification IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_resolution_knowledge
  ON tickets (knowledge_article_id)
  WHERE knowledge_article_id IS NOT NULL;

COMMIT;