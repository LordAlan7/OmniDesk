-- Tabla para evidencia y archivos adjuntos de tickets (FR-004)
BEGIN;

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id            SERIAL PRIMARY KEY,
  ticket_id     INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by   INT NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL,
  storage_key   TEXT NOT NULL UNIQUE,
  mime_type     TEXT NOT NULL,
  size_bytes    INT NOT NULL CHECK (size_bytes > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);

COMMIT;