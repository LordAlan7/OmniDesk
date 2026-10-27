-- FR-019: Extensión de la biblioteca de conocimiento para problemas recurrentes
BEGIN;

-- 1. Agregar campos para identificar un problema recurrente en la tabla existente
ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS is_recurring_problem BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS symptoms TEXT,
  ADD COLUMN IF NOT EXISTS verification TEXT;

-- 2. Crear la tabla puente entre tickets y problemas recurrentes
CREATE TABLE IF NOT EXISTS ticket_recurring_problems (
  ticket_id INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  article_id INT NOT NULL REFERENCES knowledge_articles(id) ON DELETE RESTRICT,
  linked_by INT NOT NULL REFERENCES users(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, article_id) -- Evita duplicados
);

-- Índice para buscar rápido todos los tickets de un problema
CREATE INDEX IF NOT EXISTS idx_recurring_problems_article
  ON ticket_recurring_problems (article_id);

COMMIT;