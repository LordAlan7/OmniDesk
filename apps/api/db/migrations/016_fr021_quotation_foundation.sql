
-- 016_fr021_quotation_foundation.sql
-- FR-021: estructura inicial para cotizaciones asistidas por IA.
--
-- INTEGRACIÓN DE SERVICIOS:
-- Pendiente conectar el catálogo de servicios y materiales,
-- sus precios y las reglas comerciales autorizadas.
--
-- Esta migración NO define precios, impuestos, descuentos,
-- moneda ni reglas comerciales por defecto.

BEGIN;

-- 1. Cotización principal.
-- Representa la cotización asociada a un ticket.
CREATE TABLE IF NOT EXISTS quotations (
  id SERIAL PRIMARY KEY,

  ticket_id INTEGER NOT NULL
    REFERENCES tickets(id) ON DELETE RESTRICT,

  created_by INTEGER NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'pending_review',
        'approved',
        'rejected',
        'needs_more_info'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Versiones de una cotización.
-- Cada modificación posterior deberá generar una nueva versión.
CREATE TABLE IF NOT EXISTS quotation_versions (
  id SERIAL PRIMARY KEY,

  quotation_id INTEGER NOT NULL
    REFERENCES quotations(id) ON DELETE CASCADE,

  version_number INTEGER NOT NULL
    CHECK (version_number > 0),

  ai_interaction_id INTEGER
    REFERENCES ai_interaction(id) ON DELETE SET NULL,

  created_by INTEGER NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,

  -- Información general de la propuesta.
  title TEXT,
  description TEXT,
  conditions TEXT,
  observations TEXT,

  -- Datos comerciales pendientes de integración.
  currency CHAR(3),

  subtotal NUMERIC(14, 2),
  tax_total NUMERIC(14, 2),
  discount_total NUMERIC(14, 2),
  total NUMERIC(14, 2),

  -- Permite identificar si la versión todavía tiene información pendiente.
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT quotation_versions_number_unique
    UNIQUE (quotation_id, version_number),

  CONSTRAINT quotation_versions_amounts_non_negative
    CHECK (
      (subtotal IS NULL OR subtotal >= 0)
      AND (tax_total IS NULL OR tax_total >= 0)
      AND (discount_total IS NULL OR discount_total >= 0)
      AND (total IS NULL OR total >= 0)
    ),

  CONSTRAINT quotation_versions_currency_format
    CHECK (
      currency IS NULL
      OR currency ~ '^[A-Z]{3}$'
    )
);

-- 3. Conceptos de cada versión.
-- Una versión puede contener varios servicios o materiales.
CREATE TABLE IF NOT EXISTS quotation_items (
  id SERIAL PRIMARY KEY,

  quotation_version_id INTEGER NOT NULL
    REFERENCES quotation_versions(id) ON DELETE CASCADE,

  position INTEGER NOT NULL
    CHECK (position > 0),

  concept TEXT NOT NULL
    CHECK (length(btrim(concept)) BETWEEN 1 AND 200),

  description TEXT,

  quantity NUMERIC(12, 3) NOT NULL
    CHECK (quantity > 0),

  unit TEXT,

  -- El precio permanece NULL hasta que exista una fuente autorizada
  -- o un usuario autorizado capture el valor.
  unit_price NUMERIC(14, 2),

  price_source TEXT NOT NULL DEFAULT 'placeholder'
    CHECK (
      price_source IN ('placeholder', 'catalog', 'manual')
    ),

  line_subtotal NUMERIC(14, 2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT quotation_items_position_unique
    UNIQUE (quotation_version_id, position),

  CONSTRAINT quotation_items_amounts_non_negative
    CHECK (
      (unit_price IS NULL OR unit_price >= 0)
      AND (line_subtotal IS NULL OR line_subtotal >= 0)
    ),

  CONSTRAINT quotation_items_placeholder_price
    CHECK (
      price_source <> 'placeholder'
      OR (unit_price IS NULL AND line_subtotal IS NULL)
    )
);

-- 4. Índices para consultas frecuentes.
CREATE INDEX IF NOT EXISTS idx_quotations_ticket
  ON quotations(ticket_id);

CREATE INDEX IF NOT EXISTS idx_quotations_creator
  ON quotations(created_by);

CREATE INDEX IF NOT EXISTS idx_quotations_status
  ON quotations(status);

CREATE INDEX IF NOT EXISTS idx_quotation_versions_quotation
  ON quotation_versions(quotation_id);

CREATE INDEX IF NOT EXISTS idx_quotation_versions_interaction
  ON quotation_versions(ai_interaction_id);

CREATE INDEX IF NOT EXISTS idx_quotation_items_version
  ON quotation_items(quotation_version_id);

COMMIT;
