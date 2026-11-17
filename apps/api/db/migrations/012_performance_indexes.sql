-- NFR-005: Índices de rendimiento para operaciones normales.
-- Aseguran que los listados y filtros del dashboard sean rápidos.

BEGIN;

-- Tickets: filtros comunes (estado, prioridad, técnico asignado, fechas)
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_tech ON tickets(assigned_technician_id);

-- Tickets: filtros combinados comunes (ej. estado + técnico)
CREATE INDEX IF NOT EXISTS idx_tickets_tech_status ON tickets(assigned_technician_id, status);

-- Conocimiento: búsqueda por texto (ya hay índice GIN, pero por si acaso)
-- El índice GIN para tsvector ya está en 006, pero aseguramos el de categoría.
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_articles(category_id);

-- Auditoría: búsquedas por fecha y actor
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);

-- Notificaciones (FR-020): buscar por usuario y no leídas
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read) WHERE read = false;

COMMIT;