BEGIN;

-- Permite detectar si otro asesor modificó el ticket.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Conserva el motivo junto al evento del historial.
ALTER TABLE ticket_history
  ADD COLUMN IF NOT EXISTS reason TEXT;

COMMIT;