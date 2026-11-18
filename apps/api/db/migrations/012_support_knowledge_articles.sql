-- Compatibilidad: artículos técnicos separados de documentos.
-- Los documentos existentes conservan knowledge_articles.
BEGIN;

CREATE TABLE IF NOT EXISTS support_knowledge_articles (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  solution TEXT NOT NULL,
  category_id INT NOT NULL REFERENCES ticket_categories(id),
  author_id INT NOT NULL REFERENCES users(id),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'retired')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),

  is_recurring_problem BOOLEAN NOT NULL DEFAULT FALSE,
  symptoms TEXT,
  verification TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_knowledge_category
  ON support_knowledge_articles(category_id);

CREATE INDEX IF NOT EXISTS idx_support_knowledge_status
  ON support_knowledge_articles(status);

CREATE INDEX IF NOT EXISTS idx_support_knowledge_author
  ON support_knowledge_articles(author_id);

CREATE INDEX IF NOT EXISTS idx_support_knowledge_search
  ON support_knowledge_articles
  USING gin (
    to_tsvector(
      'spanish',
      title || ' ' || problem_description || ' ' || solution
    )
  );

COMMIT;