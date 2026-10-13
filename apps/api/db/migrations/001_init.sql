-- Esquema inicial de referencia (PostgreSQL). Entidades según la sección "Data design".
-- Los repositorios actuales son en memoria; usa esto al migrar cada módulo.
-- Categorías, prioridades y estados siguen pendientes de validación con el cliente.

CREATE TABLE roles (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE ticket_categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE ticket_priorities (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);

CREATE TABLE tickets (
  id                     SERIAL PRIMARY KEY,
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  category_id            INT NOT NULL REFERENCES ticket_categories(id),
  priority_id            INT REFERENCES ticket_priorities(id),
  status                 TEXT NOT NULL DEFAULT 'Open'
                         CHECK (status IN ('Open','Assigned','In Progress','Resolved','Closed')),
  created_by             INT NOT NULL REFERENCES users(id),
  assigned_technician_id INT REFERENCES users(id),
  due_date               TIMESTAMPTZ,
  resolution             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at            TIMESTAMPTZ,
  closed_at              TIMESTAMPTZ
);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assigned ON tickets(assigned_technician_id);

CREATE TABLE ticket_history (
  id         SERIAL PRIMARY KEY,
  ticket_id  INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id   INT NOT NULL REFERENCES users(id),
  action     TEXT NOT NULL,
  from_value JSONB,
  to_value   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INT,
  actor_id   INT REFERENCES users(id),
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- El rol de la aplicación solo debe tener INSERT y SELECT sobre audit_log (NFR-009).
