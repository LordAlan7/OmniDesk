-- Constraints e índices para audit_log (NFR-009 / NFR-010).
-- Requiere que 001_init.sql ya se haya aplicado.

BEGIN;

-- Si un usuario es eliminado (lo cual no debería pasar seguido, ya que preferimos "desactivar"),
-- el registro de auditoría se conserva y el actor_id queda en NULL para no perder la traza.
-- Nota: si ya existe la FK sin el ON DELETE, primero debemos quitarla.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audit_log_actor_id_fkey'
    AND table_name = 'audit_log'
  ) THEN
    ALTER TABLE audit_log DROP CONSTRAINT audit_log_actor_id_fkey;
  END IF;
END $$;

-- Creamos la FK correcta con SET NULL.
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

-- Índices para acelerar las búsquedas más comunes del panel de administración.
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log (entity);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log (action);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON audit_log (created_at);

COMMIT;