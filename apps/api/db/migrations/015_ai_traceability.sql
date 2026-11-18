-- 015_ai_traceability.sql
-- AIR-007: Trazabilidad de conocimiento en respuestas de IA.

ALTER TABLE ai_interaction
  ADD COLUMN IF NOT EXISTS provided_context JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS generation_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Índices para búsquedas por fecha o usuario
CREATE INDEX IF NOT EXISTS idx_ai_interaction_created_at ON ai_interaction(created_at);