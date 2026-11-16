import { getPool } from '../../../shared/db/pool';
import type { DatabaseClient } from '../../../shared/db/types';
import { recordAuditInTransaction } from '../../audit';
import type { NewAuthorization, SourceAudit, SourcesRepository } from './sources.repository';
import type {
  AiSourceAuthorization,
  AiSourceChunk,
  InvalidationReason,
  IngestionStatus,
  AuthorizationStatus,
  AiSourceType,
} from './sources.types';

interface AuthorizationRow {
  id: number;
  source_type: AiSourceType;
  source_id: number;
  source_version: string;
  content_hash: string;
  title: string;
  status: AuthorizationStatus;
  requested_by: number;
  requested_at: Date;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  review_note: string | null;
  revoked_by: number | null;
  revoked_at: Date | null;
  revocation_reason: string | null;
  invalidated_at: Date | null;
  invalidation_reason: InvalidationReason | null;
  ingestion_status: IngestionStatus;
  ingestion_error: string | null;
  ingested_at: Date | null;
  chunk_count: number;
}

interface ChunkRow {
  id: number;
  authorization_id: number;
  source_type: AiSourceType;
  source_id: number;
  source_version: string;
  chunk_index: number;
  content: string;
  content_hash: string;
}

const iso = (value: Date | null) => value?.toISOString() ?? null;

const toAuthorization = (row: AuthorizationRow): AiSourceAuthorization => ({
  id: row.id,
  sourceType: row.source_type,
  sourceId: row.source_id,
  sourceVersion: row.source_version,
  contentHash: row.content_hash,
  title: row.title,
  status: row.status,
  requestedBy: row.requested_by,
  requestedAt: row.requested_at.toISOString(),
  reviewedBy: row.reviewed_by,
  reviewedAt: iso(row.reviewed_at),
  reviewNote: row.review_note,
  revokedBy: row.revoked_by,
  revokedAt: iso(row.revoked_at),
  revocationReason: row.revocation_reason,
  invalidatedAt: iso(row.invalidated_at),
  invalidationReason: row.invalidation_reason,
  ingestionStatus: row.ingestion_status,
  ingestionError: row.ingestion_error,
  ingestedAt: iso(row.ingested_at),
  chunkCount: row.chunk_count,
});

async function inTransaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (cause) {
    await client.query('ROLLBACK');
    throw cause;
  } finally {
    client.release();
  }
}

async function load(client: DatabaseClient, id: number): Promise<AiSourceAuthorization> {
  const result = await client.query<AuthorizationRow>('SELECT * FROM ai_source_authorizations WHERE id = $1', [id]);
  if (!result.rows[0]) throw new Error('Authorization not found');
  return toAuthorization(result.rows[0]);
}

export const postgresSourcesRepository: SourcesRepository = {
  async create(data: NewAuthorization, audit: SourceAudit) {
    return inTransaction(async (client) => {
      const result = await client.query<AuthorizationRow>(
        `INSERT INTO ai_source_authorizations
           (source_type, source_id, source_version, content_hash, title, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [data.sourceType, data.sourceId, data.sourceVersion, data.contentHash, data.title, data.requestedBy],
      );
      const record = toAuthorization(result.rows[0]!);
      await recordAuditInTransaction(client, { ...audit, entityId: record.id });
      return record;
    });
  },

  async findById(id) {
    const result = await getPool().query<AuthorizationRow>('SELECT * FROM ai_source_authorizations WHERE id = $1', [id]);
    return result.rows[0] ? toAuthorization(result.rows[0]) : undefined;
  },

  async findActive(type, id, version, contentHash) {
    const result = await getPool().query<AuthorizationRow>(
      `SELECT * FROM ai_source_authorizations
       WHERE source_type = $1 AND source_id = $2 AND source_version = $3 AND content_hash = $4
         AND status IN ('pending', 'approved')
       LIMIT 1`,
      [type, id, version, contentHash],
    );
    return result.rows[0] ? toAuthorization(result.rows[0]) : undefined;
  },

  async list(filters) {
    const result = await getPool().query<AuthorizationRow>(
      `SELECT * FROM ai_source_authorizations
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR source_type = $2)
         AND ($3::integer IS NULL OR source_id = $3)
       ORDER BY id DESC`,
      [filters.status ?? null, filters.sourceType ?? null, filters.sourceId ?? null],
    );
    return result.rows.map(toAuthorization);
  },

  async save(authorization, audit) {
    return inTransaction(async (client) => {
      await client.query(
        `UPDATE ai_source_authorizations
         SET status = $2, reviewed_by = $3, reviewed_at = $4, review_note = $5,
             revoked_by = $6, revoked_at = $7, revocation_reason = $8,
             invalidated_at = $9, invalidation_reason = $10
         WHERE id = $1`,
        [
          authorization.id,
          authorization.status,
          authorization.reviewedBy,
          authorization.reviewedAt,
          authorization.reviewNote,
          authorization.revokedBy,
          authorization.revokedAt,
          authorization.revocationReason,
          authorization.invalidatedAt,
          authorization.invalidationReason,
        ],
      );
      await recordAuditInTransaction(client, audit);
      return load(client, authorization.id);
    });
  },

  async completeIngestion(authorizationId, chunks, audit) {
    return inTransaction(async (client) => {
      await client.query('UPDATE ai_source_chunks SET invalidated_at = now() WHERE authorization_id = $1 AND invalidated_at IS NULL', [
        authorizationId,
      ]);
      for (const chunk of chunks) {
        await client.query(
          `INSERT INTO ai_source_chunks
             (authorization_id, source_type, source_id, source_version, chunk_index, content, content_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [authorizationId, chunk.sourceType, chunk.sourceId, chunk.sourceVersion, chunk.chunkIndex, chunk.content, chunk.contentHash],
        );
      }
      await client.query(
        `UPDATE ai_source_authorizations
         SET ingestion_status = 'ingested', ingestion_error = NULL, ingested_at = now(), chunk_count = $2
         WHERE id = $1`,
        [authorizationId, chunks.length],
      );
      await recordAuditInTransaction(client, audit);
      return load(client, authorizationId);
    });
  },

  async failIngestion(authorizationId, error, audit) {
    return inTransaction(async (client) => {
      await client.query(
        `UPDATE ai_source_authorizations
         SET ingestion_status = 'failed', ingestion_error = $2, ingested_at = NULL, chunk_count = 0
         WHERE id = $1`,
        [authorizationId, error],
      );
      await recordAuditInTransaction(client, audit);
      return load(client, authorizationId);
    });
  },

  async invalidateChunks(authorizationId) {
    await getPool().query('UPDATE ai_source_chunks SET invalidated_at = now() WHERE authorization_id = $1 AND invalidated_at IS NULL', [
      authorizationId,
    ]);
  },

  async listApprovedChunks(): Promise<AiSourceChunk[]> {
    const result = await getPool().query<ChunkRow>(
      `SELECT c.*
       FROM ai_source_chunks c
       JOIN ai_source_authorizations a ON a.id = c.authorization_id
       WHERE c.invalidated_at IS NULL
         AND a.status = 'approved'
         AND a.ingestion_status = 'ingested'
       ORDER BY c.authorization_id, c.chunk_index`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      authorizationId: row.authorization_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceVersion: row.source_version,
      chunkIndex: row.chunk_index,
      content: row.content,
      contentHash: row.content_hash,
    }));
  },
};
