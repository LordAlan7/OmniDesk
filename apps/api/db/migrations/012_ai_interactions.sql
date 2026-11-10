-- FR-013 / AIR-008: interacciones con el asistente de IA (AIInteraction).
-- Cada interacción pertenece a UN usuario; las referencias conservan fuente, versión y fragmento (AIR-007).
-- Política de conservación y datos permitidos por aprobar: hoy se conserva la pregunta y la respuesta
-- (necesarias para evaluar el asistente) y nunca claves ni el contexto completo enviado al proveedor.
-- Es idempotente. Requiere 001_init.sql (users) y 010_ai_sources.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_interactions (
  id                      SERIAL PRIMARY KEY,
  user_id                 INT  NOT NULL REFERENCES users(id),
  ticket_id               INT,
  question                TEXT NOT NULL,
  condition               TEXT NOT NULL
                          CHECK (condition IN ('recommendation', 'needs_more_info', 'insufficient_support', 'failed')),
  answer                  TEXT,
  steps                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  additional_information  JSONB NOT NULL DEFAULT '[]'::jsonb,
  failure_code            TEXT CHECK (failure_code IN ('unavailable', 'timeout', 'invalid_response')),
  provider                TEXT,
  model                   TEXT,
  duration_ms             INT  CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una interacción fallida nunca guarda una respuesta; una respondida nunca guarda un fallo.
  CONSTRAINT ai_interaction_failed_consistency CHECK (
    (condition = 'failed' AND failure_code IS NOT NULL AND answer IS NULL)
    OR (condition <> 'failed' AND failure_code IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS ai_interactions_user_created ON ai_interactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_interaction_references (
  id               SERIAL PRIMARY KEY,
  interaction_id   INT  NOT NULL REFERENCES ai_interactions(id) ON DELETE CASCADE,
  authorization_id INT  NOT NULL REFERENCES ai_source_authorizations(id),
  source_type      TEXT NOT NULL CHECK (source_type IN ('article', 'document')),
  source_id        INT  NOT NULL,
  source_version   TEXT NOT NULL,
  title            TEXT NOT NULL,
  chunk_index      INT  NOT NULL CHECK (chunk_index >= 0)
);

CREATE INDEX IF NOT EXISTS ai_interaction_references_interaction ON ai_interaction_references (interaction_id);

COMMIT;
