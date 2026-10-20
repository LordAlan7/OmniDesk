BEGIN;

-- Campos comerciales para el ticket (FR-010)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS store_location TEXT,
  ADD COLUMN IF NOT EXISTS motorcycle_model TEXT;

-- Como la regla dice que el empleado debe capturarlos al crear, 
-- los hacemos obligatorios a nivel base de datos para tickets NUEVOS.
-- (Para tickets viejos no inventamos datos, simplemente los dejamos NULL, 
-- pero la restricción se aplica a nivel de aplicación zod).
ALTER TABLE tickets
  ADD CONSTRAINT tickets_store_location_not_empty
  CHECK (store_location IS NULL OR length(trim(store_location)) > 0);

COMMIT;