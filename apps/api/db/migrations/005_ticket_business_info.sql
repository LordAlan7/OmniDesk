-- Añade la información de negocio requerida por FR-010 y BR-004
BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS store_location TEXT,
  ADD COLUMN IF NOT EXISTS motorcycle_model TEXT;

COMMIT;