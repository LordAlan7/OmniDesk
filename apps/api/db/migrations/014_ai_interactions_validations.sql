-- FR-015: persistencia de interacciones y validaciones de IA.
-- Requiere users y ai_source_authorizations.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_interactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    ticket_id INT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    reference_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_user
    ON ai_interactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_ticket
    ON ai_interactions(ticket_id)
    WHERE ticket_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_validations (
    id SERIAL PRIMARY KEY,
    interaction_id INT NOT NULL
        REFERENCES ai_interactions(id),
    reviewer_id INT NOT NULL
        REFERENCES users(id),
    decision TEXT NOT NULL
        CHECK (decision IN (
            'approved',
            'rejected',
            'needs_more_info'
        )),
    reason TEXT NOT NULL
        CHECK (char_length(reason) BETWEEN 5 AND 2000),
    supersedes_id INT REFERENCES ai_validations(id),
    follow_up_interaction_id INT
        REFERENCES ai_interactions(id),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_validations_interaction
    ON ai_validations(interaction_id, reviewed_at DESC, id DESC);

COMMIT;
