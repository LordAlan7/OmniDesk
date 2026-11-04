-- AIR-002: fuentes de conocimiento autorizadas para IA.
-- Estar en la biblioteca (knowledge_articles / knowledge_documents) NO autoriza el uso en IA:
-- la autorización es un registro propio, ligado a la fuente, su versión y la huella del contenido.
-- Es idempotente. Requiere 001_init.sql (users).

BEGIN;

CREATE TABLE IF NOT EXISTS ai_source_authorizations (
  id                  SERIAL PRIMARY KEY,
  source_type         TEXT NOT NULL CHECK (source_type IN ('article', 'document')),
  source_id           INT  NOT NULL,
  source_version      TEXT NOT NULL,
  content_hash        CHAR(64) NOT NULL,
  title               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'invalidated')),
  requested_by        INT  NOT NULL REFERENCES users(id),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by         INT  REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  review_note         TEXT,
  revoked_by          INT  REFERENCES users(id),
  revoked_at          TIMESTAMPTZ,
  revocation_reason   TEXT,
  invalidated_at      TIMESTAMPTZ,
  invalidation_reason TEXT CHECK (invalidation_reason IN ('version_changed', 'source_not_eligible', 'source_unavailable')),
  ingestion_status    TEXT NOT NULL DEFAULT 'not_ingested'
                      CHECK (ingestion_status IN ('not_ingested', 'ingested', 'failed')),
  ingestion_error     TEXT,
  ingested_at         TIMESTAMPTZ,
  chunk_count         INT  NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  -- Quien aprueba no puede ser quien propuso (separación de funciones).
  CONSTRAINT ai_source_reviewer_not_requester CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by),
  -- Una autorización aprobada siempre tiene responsable y fecha de aprobación.
  CONSTRAINT ai_source_approved_has_reviewer CHECK (status <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT ai_source_revoked_has_reason CHECK (status <> 'revoked' OR (revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL))
);

-- Una sola solicitud vigente por fuente, versión y contenido exactos.
CREATE UNIQUE INDEX IF NOT EXISTS ai_source_active_identity
  ON ai_source_authorizations (source_type, source_id, source_version, content_hash)
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_ai_source_status ON ai_source_authorizations (status);
CREATE INDEX IF NOT EXISTS idx_ai_source_source ON ai_source_authorizations (source_type, source_id);

-- Fragmentos indexados. Conservan origen y versión; el índice es DERIVADO: por sí solo no autoriza nada
-- (la recuperación exige una autorización aprobada y vigente, aunque el fragmento siga aquí).
CREATE TABLE IF NOT EXISTS ai_source_chunks (
  id               SERIAL PRIMARY KEY,
  authorization_id INT  NOT NULL REFERENCES ai_source_authorizations(id),
  source_type      TEXT NOT NULL CHECK (source_type IN ('article', 'document')),
  source_id        INT  NOT NULL,
  source_version   TEXT NOT NULL,
  chunk_index      INT  NOT NULL CHECK (chunk_index >= 0),
  content          TEXT NOT NULL,
  content_hash     CHAR(64) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_source_chunks_auth ON ai_source_chunks (authorization_id) WHERE invalidated_at IS NULL;

COMMIT;
