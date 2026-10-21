import { assertStatusInvariants } from './tickets.lifecycle';
import { Errors } from '../../shared/errors';
import { getPool } from '../../shared/db/pool';
import type { TicketFilter } from './tickets.repository';
import type {
  Ticket,
  TicketHistoryEntry,
} from './tickets.types';

interface TicketRow {
  id: number;
  title: string;
  description: string;
  category_id: number;
  store_location: string | null;
  motorcycle_model: string | null;
  priority_id: number | null;
  status: Ticket['status'];
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
  reason: string | null;
  created_at: Date;
}

type HistoryInput = Omit<
  TicketHistoryEntry,
  'id' | 'createdAt' | 'ticketId'
>;

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    storeLocation: row.store_location,
    motorcycleModel: row.motorcycle_model,
    priorityId: row.priority_id,
    status: row.status,
    createdBy: row.created_by,
    assignedTechnicianId: row.assigned_technician_id,
    dueDate: row.due_date?.toISOString() ?? null,
    resolution: row.resolution,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    closedAt: row.closed_at?.toISOString() ?? null,
    version: row.version,
  };
}

export const postgresTicketsRepository = {
  async listCategories(): Promise<{ id: number; name: string }[]> {
    const result = await getPool().query<{ id: number; name: string }>('SELECT id, name FROM ticket_categories ORDER BY id');
    return result.rows;
  },
  async listPriorities(): Promise<{ id: number; name: string; description: string; sortOrder: number }[]> {
    const result = await getPool().query<{ id: number; name: string; description: string; sort_order: number }>(
      'SELECT id, name, description, sort_order FROM ticket_priorities ORDER BY sort_order ASC',
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      sortOrder: row.sort_order,
    }));
  },
  async create(
    data: Pick<
      Ticket,
      'title' | 'description' | 'categoryId' | 'createdBy' | 'storeLocation' | 'motorcycleModel'
    >,
  ): Promise<Ticket> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      const result = await client.query<TicketRow>(
        `INSERT INTO tickets (
           title, description, category_id, created_by, store_location, motorcycle_model
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          data.title,
          data.description,
          data.categoryId,
          data.createdBy,
          data.storeLocation,
          data.motorcycleModel,
        ],
      );

      const row = result.rows[0];

      if (!row) {
        throw new Error('No se pudo crear el ticket.');
      }

      await client.query(
        `INSERT INTO ticket_history (
           ticket_id, actor_id, action, to_value
         )
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          row.id,
          data.createdBy,
          'created',
          JSON.stringify('Open'),
        ],
      );

      await client.query('COMMIT');
      return toTicket(row);
    } catch (cause) {
      await client.query('ROLLBACK');

      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        cause.code === '23503' &&
        'constraint' in cause &&
        cause.constraint === 'tickets_category_id_fkey'
      ) {
        throw Errors.validation([
          {
            field: 'categoryId',
            message: 'La categoría seleccionada no existe.',
          },
        ]);
      }

      throw cause;
    } finally {
      client.release();
    }
  },

  async saveWithHistory(
    ticket: Ticket,
    expectedVersion: number,
    entries: HistoryInput[],
  ): Promise<Ticket> {
    assertStatusInvariants(ticket);
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

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
             store_location = $13,
             motorcycle_model = $14,
             updated_at = clock_timestamp(),
             version = version + 1
         WHERE id = $11 AND version = $12
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
          expectedVersion,
          ticket.storeLocation,
          ticket.motorcycleModel,
        ],
      );

      const row = result.rows[0];

      if (!row) {
        throw Errors.conflict(
          'El ticket cambió. Actualiza la información antes de guardar.',
        );
      }

      for (const entry of entries) {
        await client.query(
          `INSERT INTO ticket_history (
             ticket_id,
             actor_id,
             action,
             from_value,
             to_value,
             reason
           )
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
          [
            ticket.id,
            entry.actorId,
            entry.action,
            JSON.stringify(entry.from ?? null),
            JSON.stringify(entry.to ?? null),
            entry.reason ?? null,
          ],
        );
      }

      await client.query('COMMIT');
      return toTicket(row);
    } catch (cause) {
      await client.query('ROLLBACK');
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        cause.code === '23503' &&
        'constraint' in cause &&
        cause.constraint === 'tickets_category_id_fkey'
      ) {
        throw Errors.validation([
          {
            field: 'categoryId',
            message: 'La categoría seleccionada no existe.',
          },
        ]);
      }

      throw cause;
    } finally {
      client.release();
    }
  },

  async findById(
    id: number,
  ): Promise<Ticket | undefined> {
    const result = await getPool().query<TicketRow>(
      'SELECT * FROM tickets WHERE id = $1',
      [id],
    );

    const row = result.rows[0];
    return row ? toTicket(row) : undefined;
  },

  async list(filter: TicketFilter): Promise<Ticket[]> {
    const result = await getPool().query<TicketRow>(
      `SELECT *
       FROM tickets
       WHERE (
         $1::integer IS NULL
         OR created_by = $1
         OR assigned_technician_id = $1
       )
         AND ($2::text IS NULL OR status = $2)
         AND ($3::integer IS NULL OR priority_id = $3)
         AND ($4::integer IS NULL OR category_id = $4)
       ORDER BY id DESC`,
      [
        filter.visibleTo,
        filter.status ?? null,
        filter.priorityId ?? null,
        filter.categoryId ?? null,
      ],
    );

    return result.rows.map(toTicket);
  },

  async historyOf(
    ticketId: number,
  ): Promise<TicketHistoryEntry[]> {
    const result = await getPool().query<HistoryRow>(
      `SELECT *
       FROM ticket_history
       WHERE ticket_id = $1
       ORDER BY id`,
      [ticketId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      actorId: row.actor_id,
      action: row.action,
      from: row.from_value,
      to: row.to_value,
      reason: row.reason,
      createdAt: row.created_at.toISOString(),
    }));
  },

  async hasPendingTickets(
    technicianId: number,
  ): Promise<boolean> {
    const result = await getPool().query<{
      pending: boolean;
    }>(
      `SELECT EXISTS (
         SELECT 1
         FROM tickets
         WHERE assigned_technician_id = $1
           AND status <> 'Closed'
       ) AS pending`,
      [technicianId],
    );

    return result.rows[0]?.pending ?? false;
  },
};
