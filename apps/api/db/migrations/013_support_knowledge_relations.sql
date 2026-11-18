-- FR-009 y FR-019: relaciones con articulos de soporte.
BEGIN;

DO $$
DECLARE
  recurring_count BIGINT;
BEGIN
  IF to_regclass('public.support_knowledge_articles') IS NULL THEN
    RAISE EXCEPTION 'Falta support_knowledge_articles';
  END IF;

  IF to_regclass('public.ticket_investigations') IS NULL THEN
    RAISE EXCEPTION 'Falta ticket_investigations';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tickets
    WHERE knowledge_article_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Hay tickets con referencias que requieren migracion manual';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ticket_investigations
    WHERE knowledge_article_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Hay investigaciones con referencias que requieren migracion manual';
  END IF;

  IF to_regclass('public.ticket_recurring_problems') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.ticket_recurring_problems'
      INTO recurring_count;

    IF recurring_count > 0 THEN
      RAISE EXCEPTION 'Hay problemas recurrentes que requieren migracion manual';
    END IF;
  END IF;
END $$;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_knowledge_article_id_fkey;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_knowledge_article_id_fkey
  FOREIGN KEY (knowledge_article_id)
  REFERENCES public.support_knowledge_articles(id)
  ON DELETE RESTRICT;

ALTER TABLE public.ticket_investigations
  DROP CONSTRAINT IF EXISTS ticket_investigations_knowledge_article_id_fkey;

ALTER TABLE public.ticket_investigations
  ADD CONSTRAINT ticket_investigations_knowledge_article_id_fkey
  FOREIGN KEY (knowledge_article_id)
  REFERENCES public.support_knowledge_articles(id)
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.ticket_recurring_problems (
  ticket_id INT NOT NULL
    REFERENCES public.tickets(id) ON DELETE CASCADE,
  article_id INT NOT NULL,
  linked_by INT NOT NULL
    REFERENCES public.users(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticket_id, article_id)
);

ALTER TABLE public.ticket_recurring_problems
  DROP CONSTRAINT IF EXISTS ticket_recurring_problems_article_id_fkey;

ALTER TABLE public.ticket_recurring_problems
  ADD CONSTRAINT ticket_recurring_problems_article_id_fkey
  FOREIGN KEY (article_id)
  REFERENCES public.support_knowledge_articles(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_recurring_problems_article
  ON public.ticket_recurring_problems(article_id);

COMMIT;