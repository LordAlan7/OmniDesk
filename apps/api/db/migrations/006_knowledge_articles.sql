-- Tabla para la biblioteca centralizada de conocimientos (FR-011)
BEGIN;

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id                   SERIAL PRIMARY KEY,
  title                TEXT NOT NULL,
  problem_description  TEXT NOT NULL,
  solution             TEXT NOT NULL,
  category_id          INT NOT NULL REFERENCES ticket_categories(id),
  author_id            INT NOT NULL REFERENCES users(id),
  status               TEXT NOT NULL DEFAULT 'draft' 
                       CHECK (status IN ('draft', 'approved', 'retired')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  version              INTEGER NOT NULL DEFAULT 1
);

-- Índices para búsquedas
CREATE INDEX idx_knowledge_category ON knowledge_articles(category_id);
CREATE INDEX idx_knowledge_status ON knowledge_articles(status);
CREATE INDEX idx_knowledge_author ON knowledge_articles(author_id);

-- Índice para búsqueda por texto (ILIKE optimizado)
CREATE INDEX idx_knowledge_search ON knowledge_articles 
  USING gin (to_tsvector('spanish', title || ' ' || problem_description || ' ' || solution));

COMMIT;