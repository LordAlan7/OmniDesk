-- NFR-009: trazabilidad y auditabilidad.
-- Requiere 001_init.sql (audit_log y ticket_history). Es idempotente.

BEGIN;

-- Resultado del evento: un intento fallido NO es un cambio aplicado.
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'applied';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_outcome_check'
  ) THEN
    ALTER TABLE audit_log
      ADD CONSTRAINT audit_log_outcome_check CHECK (outcome IN ('applied', 'rejected'));
  END IF;
END $$;

-- Identificador de correlación: relaciona historial y auditoría de una misma operación.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS correlation_id TEXT;
ALTER TABLE ticket_history ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- Índices de consulta: por recurso, actor, correlación y fecha.
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON audit_log (entity, entity_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_correlation ON audit_log (correlation_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_correlation ON ticket_history (correlation_id);

-- Protección frente a alteraciones: las tablas son de solo-agregar.
-- Única excepción: la FK audit_log.actor_id ON DELETE SET NULL puede anular el actor
-- (sin tocar ningún otro campo) para conservar la traza si se elimina una cuenta.
-- Limitación: un superusuario/propietario de la tabla puede desactivar el trigger; esto
-- NO es almacenamiento inmutable ni detección criptográfica de alteraciones (ver docs/AUDIT.md).
CREATE OR REPLACE FUNCTION forbid_history_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND TG_TABLE_NAME = 'audit_log'
     AND OLD.actor_id IS NOT NULL
     AND NEW.actor_id IS NULL
     AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '% is append-only (NFR-009): % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_mutation();

DROP TRIGGER IF EXISTS ticket_history_append_only ON ticket_history;
CREATE TRIGGER ticket_history_append_only
  BEFORE UPDATE OR DELETE ON ticket_history
  FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

DROP TRIGGER IF EXISTS ticket_history_no_truncate ON ticket_history;
CREATE TRIGGER ticket_history_no_truncate
  BEFORE TRUNCATE ON ticket_history
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_mutation();

COMMIT;
