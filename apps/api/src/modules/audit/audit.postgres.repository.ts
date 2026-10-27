import { getPool } from '../../shared/db/pool';
import type { DatabaseClient } from '../../shared/db/types';
import type { AuditFilters, AuditInput, AuditRecord } from './audit.types';

interface AuditRow {
  id: string | number;
  action: string;
  entity: string;
  entity_id: number | null;
  actor_id: number | null;
  outcome: AuditRecord['outcome'];
  correlation_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

const toRecord = (row: AuditRow): AuditRecord => ({
  id: Number(row.id),
  action: row.action,
  entity: row.entity,
  entityId: row.entity_id,
  actorId: row.actor_id,
  outcome: row.outcome,
  correlationId: row.correlation_id,
  metadata: row.metadata,
  createdAt: row.created_at.toISOString(),
});

const INSERT = `INSERT INTO audit_log (action, entity, entity_id, actor_id, outcome, correlation_id, metadata)
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`;

const insertParams = (input: AuditInput) => [
  input.action,
  input.entity,
  input.entityId,
  input.actorId,
  input.outcome ?? 'applied',
  input.correlationId ?? null,
  JSON.stringify(input.metadata ?? {}),
];

/** Solo INSERT y SELECT: la tabla además está protegida por triggers (migración 009). */
export const postgresAuditRepository = {
  /** Se ejecuta en la transacción del cliente: si falla, se revierte también el cambio de negocio. */
  async addInTransaction(client: DatabaseClient, input: AuditInput): Promise<void> {
    await client.query(INSERT, insertParams(input));
  },

  async add(input: AuditInput): Promise<void> {
    await getPool().query(INSERT, insertParams(input));
  },

  async findById(id: number): Promise<AuditRecord | undefined> {
    const result = await getPool().query<AuditRow>('SELECT * FROM audit_log WHERE id = $1', [id]);
    return result.rows[0] ? toRecord(result.rows[0]) : undefined;
  },

  async list(
    filters: AuditFilters,
    page: number,
    limit: number,
  ): Promise<{ items: AuditRecord[]; total: number }> {
    const where = `WHERE ($1::text IS NULL OR entity = $1)
        AND ($2::integer IS NULL OR entity_id = $2)
        AND ($3::text IS NULL OR action = $3)
        AND ($4::integer IS NULL OR actor_id = $4)
        AND ($5::text IS NULL OR outcome = $5)
        AND ($6::text IS NULL OR correlation_id = $6)
        AND ($7::timestamptz IS NULL OR created_at >= $7)
        AND ($8::timestamptz IS NULL OR created_at <= $8)`;
    const params = [
      filters.entity ?? null,
      filters.entityId ?? null,
      filters.action ?? null,
      filters.actorId ?? null,
      filters.outcome ?? null,
      filters.correlationId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ];

    const [rows, count] = await Promise.all([
      getPool().query<AuditRow>(
        `SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT $9 OFFSET $10`,
        [...params, limit, (page - 1) * limit],
      ),
      getPool().query<{ total: string }>(`SELECT count(*) AS total FROM audit_log ${where}`, params),
    ]);

    return { items: rows.rows.map(toRecord), total: Number(count.rows[0]?.total ?? 0) };
  },
};
