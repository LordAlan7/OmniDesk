-- 013_ai_validation.sql
-- AIR-006: validación humana persistida para bloquear aplicaciones de IA sin revisión.

CREATE TABLE IF NOT EXISTS ai_validation (
  id                SERIAL PRIMARY KEY,
  interaction_id    INTEGER NOT NULL REFERENCES ai_interaction(id) ON DELETE RESTRICT,
  proposal_id       TEXT NOT NULL,
  content_version   TEXT NOT NULL,
  destination_type  TEXT NOT NULL CHECK (destination_type IN ('ticket','quotation','other')),
  destination_id    INTEGER,
  decision          TEXT NOT NULL CHECK (decision IN ('approved','rejected','needs_more_info')),
  reason            TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 2000),
  reviewer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes_id     INTEGER REFERENCES ai_validation(id) ON DELETE SET NULL,
  applied_at        TIMESTAMPTZ,
  applied_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ai_validation_version_unique
    UNIQUE (interaction_id, content_version, destination_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_validation_interaction
  ON ai_validation(interaction_id);
CREATE INDEX IF NOT EXISTS idx_ai_validation_destination
  ON ai_validation(destination_type, destination_id);
CREATE INDEX IF NOT EXISTS idx_ai_validation_reviewer
  ON ai_validation(reviewer_id);