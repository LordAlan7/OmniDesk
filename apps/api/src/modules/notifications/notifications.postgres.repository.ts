import { getPool } from '../../shared/db/pool';
import type { DatabaseClient } from '../../shared/db/types';
import type {
  Notification,
  NotificationInput,
  NotificationPage,
  NotificationFilters,
} from './notifications.types';

interface NotificationRow {
  id: string;
  user_id: number;
  ticket_id: number | null;
  event_type: string;
  message: string;
  ref_entity: string;
  ref_id: number | null;
  read: boolean;
  read_at: Date | null;
  dedup_key: string;
  correlation_id: string | null;
  created_at: Date;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: Number(row.id),
    userId: row.user_id,
    ticketId: row.ticket_id,
    eventType: row.event_type,
    message: row.message,
    refEntity: row.ref_entity,
    refId: row.ref_id,
    read: row.read,
    readAt: row.read_at?.toISOString() ?? null,
    dedupKey: row.dedup_key,
    correlationId: row.correlation_id,
    createdAt: row.created_at.toISOString(),
  };
}

const INSERT = `INSERT INTO notifications
  (user_id, ticket_id, event_type, message, ref_entity, ref_id, dedup_key, correlation_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING *`;

const insertParams = (input: NotificationInput) => [
  input.userId,
  input.ticketId,
  input.eventType,
  input.message,
  input.refEntity ?? 'ticket',
  input.refId ?? input.ticketId,
  input.dedupKey,
  input.correlationId ?? null,
];

// Cláusula WHERE compartida por list y count.
// - $1 = user_id
// - $2 = onlyUnread (boolean)
// - $3 = accessibleTicketIds (int[] o null)
// Decisión 3: si accessibleTicketIds es null (TICKETS_READ_ALL), no filtra.
// Si es un array, solo notificaciones de tickets accesibles.
// Las notificaciones con ticket_id NULL (futuras) siempre visibles.
const ACCESS_CLAUSE = `AND ($3::int[] IS NULL OR ticket_id = ANY($3) OR ticket_id IS NULL)`;

export const postgresNotificationsRepository = {
  async addInTransaction(
    client: DatabaseClient,
    input: NotificationInput,
  ): Promise<boolean> {
    const result = await client.query<NotificationRow>(INSERT, insertParams(input));
    return result.rowCount === 1;
  },

  async add(input: NotificationInput): Promise<boolean> {
    const result = await getPool().query<NotificationRow>(INSERT, insertParams(input));
    return result.rowCount === 1;
  },

  async list(filters: NotificationFilters): Promise<NotificationPage> {
    const where = `WHERE user_id = $1 AND ($2::boolean IS FALSE OR read = FALSE) ${ACCESS_CLAUSE}`;
    const params = [filters.userId, filters.onlyUnread ?? false, filters.accessibleTicketIds];

    const [rows, count] = await Promise.all([
      getPool().query<NotificationRow>(
        `SELECT * FROM notifications ${where}
         ORDER BY id DESC LIMIT $4 OFFSET $5`,
        [...params, filters.limit, (filters.page - 1) * filters.limit],
      ),
      getPool().query<{ total: string }>(
        `SELECT count(*) AS total FROM notifications ${where}`,
        params,
      ),
    ]);

    return {
      items: rows.rows.map(toNotification),
      total: Number(count.rows[0]?.total ?? 0),
    };
  },

  async unreadCount(userId: number, accessibleTicketIds: number[] | null): Promise<number> {
    const result = await getPool().query<{ count: string }>(
      `SELECT count(*) AS count FROM notifications
       WHERE user_id = $1 AND read = FALSE ${ACCESS_CLAUSE}`,
      [userId, false, accessibleTicketIds],
    );
    return Number(result.rows[0]?.count ?? 0);
  },

  async markRead(userId: number, id: number): Promise<Notification | undefined> {
    const result = await getPool().query<NotificationRow>(
      `UPDATE notifications
       SET read = TRUE, read_at = now()
       WHERE id = $1 AND user_id = $2 AND read = FALSE
       RETURNING *`,
      [id, userId],
    );
    return result.rows[0] ? toNotification(result.rows[0]) : undefined;
  },

  async markAllRead(userId: number): Promise<number> {
    const result = await getPool().query(
      `UPDATE notifications
       SET read = TRUE, read_at = now()
       WHERE user_id = $1 AND read = FALSE`,
      [userId],
    );
    return result.rowCount ?? 0;
  },
};