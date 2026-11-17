-- 016_ai_integration.sql
-- Integracion FR-015 + AIR-006 + AIR-007.
-- No elimina los datos historicos.

BEGIN;

ALTER TABLE ai_interaction
  ADD COLUMN IF NOT EXISTS provided_context
    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS citations
    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS generation_config
    JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO ai_interaction (
  id,
  user_id,
  ticket_id,
  question,
  answer,
  sources,
  ai_generated,
  created_at,
  provided_context,
  citations,
  generation_config
)
SELECT
  legacy.id,
  legacy.user_id,
  legacy.ticket_id,
  legacy.question,
  legacy.answer,
  legacy.reference_data,
  TRUE,
  legacy.created_at,
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb
FROM ai_interactions AS legacy
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('ai_interaction', 'id'),
  GREATEST(
    COALESCE((SELECT MAX(id) FROM ai_interaction), 0),
    1
  ),
  (SELECT COUNT(*) > 0 FROM ai_interaction)
);

COMMIT;
