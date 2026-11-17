-- AIR-006 + FR-015
-- Permitir revisiones sucesivas conservando el historial.

BEGIN;

DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = 'ai_validation'::regclass
          AND c.contype = 'u'
          AND (
              SELECT array_agg(
                  a.attname::text
                  ORDER BY a.attname::text
              )
              FROM unnest(c.conkey) AS k(attnum)
              JOIN pg_attribute a
                ON a.attrelid = c.conrelid
               AND a.attnum = k.attnum
          ) = ARRAY[
              'content_version',
              'destination_type',
              'interaction_id'
          ]::text[]
    LOOP
        EXECUTE format(
            'ALTER TABLE ai_validation DROP CONSTRAINT %I',
            constraint_name
        );
    END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ai_validation_latest_version
ON ai_validation (
    interaction_id,
    content_version,
    destination_type,
    id DESC
);

COMMIT;