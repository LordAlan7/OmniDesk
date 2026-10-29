-- FR-020: notificaciones internas de tickets.
-- Requiere: 001_init.sql (tickets, users), 009_audit_traceability.sql (correlation_id).
-- Idempotente.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Tabla de notificaciones (FR-020)
-- ──────────────────────────────────────────────────────────────────────────
-- Cada registro es una notificación interna dirigida a un usuario específico
-- sobre un evento confirmado de un ticket. El contenido del mensaje es breve
-- y no expone información interna (FR-009 decisión 7): solo indica el evento
-- y el ticket, nunca la resolución ni las investigaciones.
--
-- Reglas de negocio (FR-020):
-- - No se notifica al actor que ejecutó la acción.
-- - No se notifica al técnico anterior tras una reasignación.
-- - Las notificaciones se revalidan al consultar: si el destinatario perdió
--   acceso al ticket (reasignación, desactivación), la notificación se
--   OCULTA de la lista y del contador, sin borrarse (NFR-009: trazabilidad).
-- - La "lectura" no significa atención; es solo el estado del indicador.
--
-- Deduplicación (decisión 7):
-- - dedup_key = (user_id, ticket_id, event_type, correlation_id) con UNIQUE.
-- - Dos envíos del mismo evento (misma correlation_id) al mismo usuario se
--   ignoran (ON CONFLICT DO NOTHING). Si el correlation_id es distinto, se
--   guarda aunque sea el mismo event_type (eventos diferentes en el tiempo).
CREATE TABLE IF NOT EXISTS notifications (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ticket_id es NULLABLE solo para notificaciones no relacionadas con tickets
  -- (reservado para futuras extensiones). Hoy siempre es un ticket.
  ticket_id       INT REFERENCES tickets(id) ON DELETE CASCADE,
  -- event_type coincide con el historyAction del ticket (ej: 'assigned',
  -- 'priority_changed', 'status_changed', 'reopened', 'investigation_logged').
  event_type      TEXT NOT NULL,
  -- Mensaje breve, sin información interna. Máximo 200 caracteres.
  message         TEXT NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 200),
  -- Referencia al recurso para navegación: siempre { entity: 'ticket', id }.
  ref_entity      TEXT NOT NULL DEFAULT 'ticket',
  ref_id          INT,
  -- Estado de lectura. Decisión 4: abrir la notificación la marca como leída.
  read            BOOLEAN NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  -- Deduplicación (decisión 7).
  dedup_key       TEXT NOT NULL,
  -- correlation_id de la petición que originó el evento (NFR-009).
  -- Relaciona la notificación con el evento de auditoría correspondiente.
  correlation_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clave única de deduplicación. ON CONFLICT DO NOTHING: si el mismo evento
-- (misma correlation_id) intenta notificar dos veces al mismo usuario, se
-- ignora la segunda. Esto protege contra dobles-envíos y reintentos.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_key_unique
  ON notifications (dedup_key);

-- Índices para consultas frecuentes:
-- - listado por usuario (ordenado por id DESC = más reciente primero)
-- - contador de no leídas por usuario
-- - purga futura por fecha (política de conservación pendiente)
CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id)
  WHERE read = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications (created_at);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Restricción: ref_entity y ref_id coherentes
-- ──────────────────────────────────────────────────────────────────────────
-- Si ref_entity = 'ticket', ref_id debe apuntar al ticket_id. Si algún día
-- se añade otro tipo de ref, se ajusta esta restricción.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_ref_consistency'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_ref_consistency
      CHECK (
        (ref_entity = 'ticket' AND ref_id = ticket_id)
        OR (ref_entity <> 'ticket')
      );
  END IF;
END $$;

COMMIT;