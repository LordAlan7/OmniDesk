-- FR-015 + AIR-006
-- Unificar referencias de revisiones con ai_interaction.
-- No elimina interacciones ni revisiones históricas.

BEGIN;

-- Detener la migración si existen referencias sin correspondencia.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM ai_validations v
        LEFT JOIN ai_interaction i
            ON i.id = v.interaction_id
        WHERE i.id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Hay revisiones con interaction_id inexistente en ai_interaction';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM ai_validations v
        LEFT JOIN ai_interaction i
            ON i.id = v.follow_up_interaction_id
        WHERE v.follow_up_interaction_id IS NOT NULL
          AND i.id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Hay seguimientos inexistentes en ai_interaction';
    END IF;
END
$$;

ALTER TABLE ai_validations
DROP CONSTRAINT IF EXISTS
    ai_validations_interaction_id_fkey;

ALTER TABLE ai_validations
ADD CONSTRAINT ai_validations_interaction_id_fkey
FOREIGN KEY (interaction_id)
REFERENCES ai_interaction(id);

ALTER TABLE ai_validations
DROP CONSTRAINT IF EXISTS
    ai_validations_follow_up_interaction_id_fkey;

ALTER TABLE ai_validations
ADD CONSTRAINT ai_validations_follow_up_interaction_id_fkey
FOREIGN KEY (follow_up_interaction_id)
REFERENCES ai_interaction(id);

COMMIT;