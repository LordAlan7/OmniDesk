CREATE TABLE IF NOT EXISTS ai_interaction (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ticket_id     INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  question      TEXT,
  answer        TEXT,
  sources       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_generated  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_interaction_user ON ai_interaction(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_interaction_ticket ON ai_interaction(ticket_id);