import { assertStatusInvariants } from './tickets.lifecycle';
import { Errors } from '../../shared/errors';
import { getPool } from '../../shared/db/pool';
import { currentCorrelationId } from '../../shared/context/requestContext';
import { recordAuditInTransaction } from '../audit';
import { ticketAuditFor } from './tickets.audit';
import type { TicketFilter } from './tickets.repository';
import type {
  Ticket,
  TicketHistoryEntry,
  TicketInvestigation,
} from './tickets.types';

interface TicketRow {
  id: number;
  title: string;
  description: string;
  category_id: number;
  priority_id: number | null;
  status: Ticket['status'];
  created_by: number;
  assigned_technician_id: number | null;
  due_date: Date | null;
  resolution: string | null;
  resolution_verification: string | null;
  root_cause: string | null;
  resolution_observations: string | null;
  knowledge_article_id: number | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
  version: number;
  store_location: string | null;
  motorcycle_model: string | null;
}

interface HistoryRow {
  id: number;
  ticket_id: number;
  actor_id: number;
  action: string;
  from_value: unknown;
  to_value: unknown;
  reason: string | null;
  correlation_id: string | null;
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
    priorityId: row.priority_id,
    status: row.status,
    createdBy: row.created_by,
    assignedTechnicianId: row.assigned_technician_id,
    dueDate: row.due_date?.toISOString() ?? null,
    resolution: row.resolution,
    resolutionVerification: row.resolution_verification,
    rootCause: row.root_cause,
    resolutionObservations: row.resolution_observations,
    knowledgeArticleId: row.knowledge_article_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    closedAt: row.closed_at?.toISOString() ?? null,
    version: row.version,
    storeLocation: row.store_location,
    motorcycleModel: row.motorcycle_model,
  };
}

interface InvestigationRow {
  id: number;
  ticket_id: number;
  author_id: number;
  activity: string;
  result: string;
  knowledge_article_id: number | null;
  created_at: Date;
  author_name: string;
  knowledge_article_title: string | null;
}

function toInvestigation(row: InvestigationRow): TicketInvestigation {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    authorName: row.author_name,
    activity: row.activity,
    result: row.result,
    knowledgeArticleId: row.knowledge_article_id,
    knowledgeArticleTitle: row.knowledge_article_title,
    createdAt: row.created_at.toISOString(),
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
           ticket_id, actor_id, action, to_value, correlation_id
         )
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [
          row.id,
          data.createdBy,
          'created',
          JSON.stringify('Open'),
          currentCorrelationId(),
        ],
      );

      await recordAuditInTransaction(client, {
        action: 'ticket.created',
        entity: 'ticket',
        entityId: row.id,
        actorId: data.createdBy,
        metadata: { to: 'Open' },
      });

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
             resolution_verification = $15,
             root_cause = $16,
             resolution_observations = $17,
             knowledge_article_id = $18,
             updated_at = clock_timestamp(),
             version = version + 1
         WHERE id = $11 AND version = $12
         RETURNING *`,
        [
          ticket.title,                    // $1
          ticket.description,              // $2
          ticket.categoryId,               // $3
          ticket.priorityId,               // $4
          ticket.status,                   // $5
          ticket.assignedTechnicianId,     // $6
          ticket.dueDate,                  // $7
          ticket.resolution,               // $8
          ticket.resolvedAt,               // $9
          ticket.closedAt,                  // $10
          ticket.id,                       // $11 (WHERE)
          expectedVersion,                  // $12 (WHERE)
          ticket.storeLocation,             // $13
          ticket.motorcycleModel,           // $14
          ticket.resolutionVerification,    // $15
          ticket.rootCause,                 // $16
          ticket.resolutionObservations,    // $17
          ticket.knowledgeArticleId,         // $18
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
             reason,
             correlation_id
           )
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
          [
            ticket.id,
            entry.actorId,
            entry.action,
            JSON.stringify(entry.from ?? null),
            JSON.stringify(entry.to ?? null),
            entry.reason ?? null,
            currentCorrelationId(),
          ],
        );

        // NFR-009: el evento de auditoría se confirma (o revierte) junto con el cambio.
        const audit = ticketAuditFor(ticket.id, entry);
        if (audit) await recordAuditInTransaction(client, audit);
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

  /** Evento de historial sin modificar el ticket (p. ej. notas de avance, FR-008). Historial y auditoría van en una transacción. */
  async addHistory(
    entry: Omit<TicketHistoryEntry, 'id' | 'createdAt'>,
  ): Promise<TicketHistoryEntry> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      const result = await client.query<HistoryRow>(
        `INSERT INTO ticket_history (
           ticket_id, actor_id, action, from_value, to_value, reason, correlation_id
         )
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
         RETURNING *`,
        [
          entry.ticketId,
          entry.actorId,
          entry.action,
          JSON.stringify(entry.from ?? null),
          JSON.stringify(entry.to ?? null),
          entry.reason ?? null,
          currentCorrelationId(),
        ],
      );

      const audit = ticketAuditFor(entry.ticketId, entry);
      if (audit) await recordAuditInTransaction(client, audit);

      await client.query('COMMIT');

      const row = result.rows[0]!;
      return {
        id: row.id,
        ticketId: row.ticket_id,
        actorId: row.actor_id,
        action: row.action,
        from: row.from_value,
        to: row.to_value,
        reason: row.reason,
        correlationId: row.correlation_id,
        createdAt: row.created_at.toISOString(),
      };
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
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
      correlationId: row.correlation_id,
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

    // ──────────────────────────────────────────────────────────────────────────────
  // FR-019: Problemas recurrentes vinculados
  // ──────────────────────────────────────────────────────────────────────────────
  async linkRecurringProblem(ticketId: number, articleId: number, linkedBy: number): Promise<void> {
    try {
      await getPool().query(
        `INSERT INTO ticket_recurring_problems (ticket_id, article_id, linked_by)
         VALUES ($1, $2, $3)`,
        [ticketId, articleId, linkedBy],
      );
    } catch (error: any) {
      // Si el código de error es 23505, significa que ya existe la relación (UNIQUE)
      if (error.code === '23505') {
        throw Errors.conflict('Este problema ya está vinculado a este ticket.');
      }
      // Si el código es 23503, la FK falló (el ticket o el artículo no existen)
      if (error.code === '23503') {
        throw Errors.validation([
          { field: 'articleId', message: 'El artículo o el ticket no existe.' },
        ]);
      }
      throw error;
    }
  },

  async unlinkRecurringProblem(ticketId: number, articleId: number): Promise<void> {
    const result = await getPool().query(
      `DELETE FROM ticket_recurring_problems
       WHERE ticket_id = $1 AND article_id = $2`,
      [ticketId, articleId],
    );
    if (result.rowCount === 0) {
      throw Errors.notFound('Vínculo de problema recurrente');
    }
  },

  async getRecurringProblems(ticketId: number): Promise<number[]> {
    const result = await getPool().query<{ article_id: number }>(
      `SELECT article_id FROM ticket_recurring_problems
       WHERE ticket_id = $1 ORDER BY linked_at ASC`,
      [ticketId],
    );
    return result.rows.map((r) => r.article_id);
  },

    /** FR-009: registra una actividad de investigación y su evento de historial + auditoría en una transacción. */
  async addInvestigation(
    input: Omit<TicketInvestigation, 'id' | 'createdAt' | 'authorName' | 'knowledgeArticleTitle'>,
  ): Promise<TicketInvestigation> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
        `INSERT INTO ticket_investigations (ticket_id, author_id, activity, result, knowledge_article_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.ticketId,
          input.authorId,
          input.activity,
          input.result,
          input.knowledgeArticleId ?? null,
        ],
      );

      const inserted = insertResult.rows[0];
      if (!inserted) throw new Error('No se pudo registrar la investigación.');

      // Evento en ticket_history (texto libre no se copia a audit_log: valuesInAudit=false).
      await client.query(
        `INSERT INTO ticket_history (ticket_id, actor_id, action, correlation_id)
         VALUES ($1, $2, 'investigation_logged', $3)`,
        [input.ticketId, input.authorId, currentCorrelationId()],
      );

      // NFR-009: el evento de auditoría se confirma (o revierte) junto con el cambio.
      const audit = ticketAuditFor(input.ticketId, {
        actorId: input.authorId,
        action: 'investigation_logged',
      });
      if (audit) await recordAuditInTransaction(client, audit);

      await client.query('COMMIT');

      // Recarga con joins para resolver autor y título del artículo.
      const result = await getPool().query<InvestigationRow>(
        `SELECT i.*, u.name AS author_name, ka.title AS knowledge_article_title
         FROM ticket_investigations i
         JOIN users u ON u.id = i.author_id
         LEFT JOIN knowledge_articles ka ON ka.id = i.knowledge_article_id
         WHERE i.id = $1`,
        [inserted.id],
      );

      return toInvestigation(result.rows[0]!);
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  },

  /** FR-009: lista las investigaciones de un ticket en orden cronológico, con autor y artículo. */
  async listInvestigations(ticketId: number): Promise<TicketInvestigation[]> {
    const result = await getPool().query<InvestigationRow>(
      `SELECT i.*, u.name AS author_name, ka.title AS knowledge_article_title
       FROM ticket_investigations i
       JOIN users u ON u.id = i.author_id
       LEFT JOIN knowledge_articles ka ON ka.id = i.knowledge_article_id
       WHERE i.ticket_id = $1
       ORDER BY i.id`,
      [ticketId],
    );

    return result.rows.map(toInvestigation);
  },
};
