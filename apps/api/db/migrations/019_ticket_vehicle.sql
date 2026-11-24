-- Paso 6: vínculo ticket ↔ motocicleta del inventario (contrato v1.0).
-- Solo referencia externa + copia mínima; el catálogo vive en inventario.
BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS vehicle_vin      TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model_id TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_brand    TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model    TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_year     INTEGER;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_vehicle_vin_format
  CHECK (vehicle_vin IS NULL OR vehicle_vin ~ '^[A-HJ-NPR-Z0-9]{17}$');

ALTER TABLE tickets
  ADD CONSTRAINT tickets_vehicle_year_range
  CHECK (vehicle_year IS NULL OR vehicle_year BETWEEN 1900 AND 2100);

CREATE INDEX IF NOT EXISTS idx_tickets_vehicle_vin
  ON tickets (vehicle_vin) WHERE vehicle_vin IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_vehicle_model_id
  ON tickets (vehicle_model_id) WHERE vehicle_model_id IS NOT NULL;

COMMIT;