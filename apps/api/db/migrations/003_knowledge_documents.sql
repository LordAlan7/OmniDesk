BEGIN;
CREATE TABLE knowledge_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
INSERT INTO knowledge_categories(name) VALUES ('Manuales'), ('Procedimientos'), ('Documentación técnica');
CREATE TABLE stored_files (
  id UUID PRIMARY KEY,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  size_bytes INT NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256 CHAR(64) NOT NULL,
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (octet_length(content) = size_bytes)
);
CREATE TABLE knowledge_articles (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL,
  category_id INT NOT NULL REFERENCES knowledge_categories(id),
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE knowledge_documents (
  id INT PRIMARY KEY REFERENCES knowledge_articles(id),
  source TEXT NOT NULL,
  source_reference TEXT,
  edition TEXT,
  document_date DATE,
  file_id UUID NOT NULL UNIQUE REFERENCES stored_files(id),
  version_id UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  access_roles TEXT[] NOT NULL DEFAULT '{}',
  revision INT NOT NULL DEFAULT 1 CHECK (revision > 0),
  ai_authorized BOOLEAN NOT NULL DEFAULT FALSE CHECK (ai_authorized = FALSE),
  CHECK (access_roles <@ ARRAY['Employee','Technician','Service Advisor','Manager','Administrator']::TEXT[])
);
CREATE INDEX knowledge_articles_category_idx ON knowledge_articles(category_id);
CREATE INDEX knowledge_documents_status_idx ON knowledge_documents(status);
COMMIT;
