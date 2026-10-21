-- Enriquece el catálogo de prioridades con descripción y orden (FR-006)
BEGIN;

ALTER TABLE ticket_priorities
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

UPDATE ticket_priorities SET description = 'Baja - Problema con impacto mínimo, sin urgencia', sort_order = 1 WHERE name = 'Low';
UPDATE ticket_priorities SET description = 'Media - Problema con impacto moderado, atención normal', sort_order = 2 WHERE name = 'Medium';
UPDATE ticket_priorities SET description = 'Alta - Problema importante que afecta operaciones', sort_order = 3 WHERE name = 'High';
UPDATE ticket_priorities SET description = 'Crítica - Problema urgente que bloquea operaciones', sort_order = 4 WHERE name = 'Critical';

COMMIT;