BEGIN;

-- Evita correos duplicados aunque cambien las mayúsculas
-- o existan espacios al principio o al final.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique
ON users (lower(btrim(email)));

-- Roles que utiliza actualmente la aplicación.
INSERT INTO roles (name)
VALUES
  ('Employee'),
  ('Technician'),
  ('Service Advisor'),
  ('Manager'),
  ('Administrator')
ON CONFLICT (name) DO NOTHING;

COMMIT;