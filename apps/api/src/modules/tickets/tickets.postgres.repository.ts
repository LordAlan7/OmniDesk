import type { PoolClient } from 'pg';
import { getPool } from '../../shared/db/pool';
import { Errors } from '../../shared/errors';
import { assertStatusInvariants } from './tickets.lifecycle';
import type {
  Ticket,
  TicketHistoryEntry,
  TicketStatus,
} from './tickets.types';
import type { TicketFilter } from './tickets.repository';

// ──────────────────────────────────────────────────────────────────────────────
// Tipos de fila en PostgreSQL
// ──────────────────────────────────────────────────────────────────────────────
interface TicketRow {
  id: number;
  title: string;
  description: string;
  category_id: number;
  priority_id: number | null;
  status: TicketStatus;
  created_by: number;
  assigned_technician_id: number | null;
  due_date: Date | null;
  resolution: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
  version: number;
}

interface HistoryRow {
  id: number;
  ticket_id: number;
  actor_id: number;
  action: string;
  from_value: unknown;
  to_value: unknown;
  created_at: Date;
}

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    priorityId: row.priority_id,
    status: row.status,
    createdBy: row.created_by,
    assignedTechnicianId: row.assigned_technician_id,
    dueDate: row.due_date ? row.due_date.toISOString() : null,
    resolution: row.resolution,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    version: row.version,
  };
}

function toHistory(row: HistoryRow): TicketHistoryEntry {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    actorId: row.actor_id,
    action: row.action,
    from: row.from_value,
    to: row.to_value,
    createdAt: row.created_at.toISOString(),
  };
}

const SELECT_TICKETS = `
  SELECT
    id, title, description, category_id, priority_id, status,
    created_by, assigned_technician_id, due_date, resolution,
    created_at, updated_at, resolved_at, closed_at, version
  FROM tickets
`;

// ──────────────────────────────────────────────────────────────────────────────
// Operaciones con transacción (críticas)
// ──────────────────────────────────────────────────────────────────────────────

async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (cause) {
    await client.query('ROLLBACK');
    throw cause;
  } finally {
    client.release();
  }
}

async function findByIdWithClient(
  client: PoolClient,
  id: number,
): Promise<Ticket | undefined> {
  const result = await client.query<TicketRow>(
    `${SELECT_TICKETS} WHERE id = $1`,
    [id],
  );
  return result.rows[0] ? toTicket(result.rows[0]) : undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// API pública del repositorio (equivalente a tickets.repository.ts)
// ──────────────────────────────────────────────────────────────────────────────

export const postgresTicketsRepository = {
  async create(
    data: Pick<Ticket, 'title' | 'description' | 'categoryId' | 'createdBy'>,
  ): Promise<Ticket> {
    return withTransaction(async (client) => {
      // Validar categoría existente (FK real).
      const category = await client.query(
        'SELECT id FROM ticket_categories WHERE id = $1',
        [data.categoryId],
      );
      if (category.rows.length === 0) {
        throw Errors.validation([
          { field: 'categoryId', message: 'La categoría no existe.' },
        ]);
      }

      const result = await client.query<TicketRow>(
        `INSERT INTO tickets
           (title, description, category_id, created_by, status, version)
         VALUES ($1, $2, $3, $4, 'Open', 1)
         RETURNING *`,
        [data.title, data.description, data.categoryId, data.createdBy],
      );

      if (!result.rows[0]) {
        throw new Error('No se pudo crear el ticket.');
      }

      return toTicket(result.rows[0]);
    });
  },

  async findById(id: number): Promise<Ticket | undefined> {
    const result = await getPool().query<TicketRow>(
      `${SELECT_TICKETS} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? toTicket(result.rows[0]) : undefined;
  },

  async list(filter: TicketFilter): Promise<Ticket[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    // visibleTo: si no es null, restringir a "es creador o está asignado".
    if (filter.visibleTo !== null) {
      values.push(filter.visibleTo);
      conditions.push(
        `(created_by = $${values.length} OR assigned_technician_id = $${values.length})`,
      );
    }

    if (filter.status) {
      values.push(filter.status);
      conditions.push(`status = $${values.length}`);
    }

    if (filter.priorityId !== undefined) {
      values.push(filter.priorityId);
      conditions.push(`priority_id = $${values.length}`);
    }

    if (filter.categoryId !== undefined) {
      values.push(filter.categoryId);
      conditions.push(`category_id = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await getPool().query<TicketRow>(
      `${SELECT_TICKETS} ${where} ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map(toTicket);
  },

  /**
   * Guarda el ticket completo.
   * - Valida invariantes de estado.
   * - Incrementa la versión (versionado optimista).
   * - Devuelve el ticket actualizado con su nueva versión.
   */
  async save(ticket: Ticket): Promise<Ticket> {
    assertStatusInvariants(ticket);

    return withTransaction(async (client) => {
      const result = await client.query<TicketRow>(
        `UPDATE tickets
           SET title = $1,
               description = $2,
               category_id = $3,
               priority_id = $4,
               status = $5,
               assigned_technician_id = $6,
               due_date = $7,
               resolution = $8,
               resolved_at = $9,
               closed_at = $10,
               updated_at = NOW(),
               version = version + 1
         WHERE id = $11
         RETURNING *`,
        [
          ticket.title,
          ticket.description,
          ticket.categoryId,
          ticket.priorityId,
          ticket.status,
          ticket.assignedTechnicianId,
          ticket.dueDate,
          ticket.resolution,
          ticket.resolvedAt,
          ticket.closedAt,
          ticket.id,
        ],
      );

      if (!result.rows[0]) {
        throw Errors.notFound('Ticket');
      }

      return toTicket(result.rows[0]);
    });
  },

  async addHistory(
    entry: Omit<TicketHistoryEntry, 'id' | 'createdAt'>,
  ): Promise<TicketHistoryEntry> {
    const result = await getPool().query<HistoryRow>(
      `INSERT INTO ticket_history
         (ticket_id, actor_id, action, from_value, to_value)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        entry.ticketId,
        entry.actorId,
        entry.action,
        entry.from ?? null,
        entry.to ?? null,
      ],
    );

    if (!result.rows[0]) {
      throw new Error('No se pudo registrar el historial del ticket.');
    }

    return toHistory(result.rows[0]);
  },

  async historyOf(ticketId: number): Promise<TicketHistoryEntry[]> {
    const result = await getPool().query<HistoryRow>(
      `SELECT * FROM ticket_history
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId],
    );
    return result.rows.map(toHistory);
  },
};