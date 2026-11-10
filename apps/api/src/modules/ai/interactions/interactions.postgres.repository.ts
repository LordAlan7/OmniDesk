import { getPool } from '../../../shared/db/pool';
import type { DatabaseClient } from '../../../shared/db/types';
import { recordAuditInTransaction } from '../../audit';
import type { AIProviderFailure } from '../providers/ai-provider';
import type { AiSourceType, SourceReference } from '../sources/sources.types';
import type { AiInteraction, InteractionCondition, InteractionsRepository } from './interactions.types';

interface InteractionRow {
  id: number;
  user_id: number;
  ticket_id: number | null;
  question: string;
  condition: InteractionCondition;
  answer: string | null;
  steps: string[];
  additional_information: string[];
  failure_code: AIProviderFailure | null;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  created_at: Date;
}

interface ReferenceRow {
  authorization_id: number;
  source_type: AiSourceType;
  source_id: number;
  source_version: string;
  title: string;
  chunk_index: number;
}

const toReference = (row: ReferenceRow): SourceReference => ({
  authorizationId: row.authorization_id,
  sourceType: row.source_type,
  sourceId: row.source_id,
  sourceVersion: row.source_version,
  title: row.title,
  chunkIndex: row.chunk_index,
});

const toInteraction = (row: InteractionRow, references: ReferenceRow[]): AiInteraction => ({
  id: row.id,
  userId: row.user_id,
  ticketId: row.ticket_id,
  question: row.question,
  condition: row.condition,
  answer: row.answer,
  steps: row.steps,
  additionalInformation: row.additional_information,
  failureCode: row.failure_code,
  provider: row.provider,
  model: row.model,
  durationMs: row.duration_ms,
  references: references.map(toReference),
  createdAt: row.created_at.toISOString(),
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

export const postgresInteractionsRepository: InteractionsRepository = {
  async create(data, audit) {
    return inTransaction(async (client) => {
      const inserted = await client.query<InteractionRow>(
        `INSERT INTO ai_interactions
           (user_id, ticket_id, question, condition, answer, steps, additional_information,
            failure_code, provider, model, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
         RETURNING *`,
        [
          data.userId,
          data.ticketId,
          data.question,
          data.condition,
          data.answer,
          JSON.stringify(data.steps),
          JSON.stringify(data.additionalInformation),
          data.failureCode,
          data.provider,
          data.model,
          data.durationMs,
        ],
      );
      const row = inserted.rows[0]!;

      for (const reference of data.references) {
        await client.query(
          `INSERT INTO ai_interaction_references
             (interaction_id, authorization_id, source_type, source_id, source_version, title, chunk_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            row.id,
            reference.authorizationId,
            reference.sourceType,
            reference.sourceId,
            reference.sourceVersion,
            reference.title,
            reference.chunkIndex,
          ],
        );
      }

      // La interacción y su auditoría se confirman juntas (NFR-009).
      await recordAuditInTransaction(client, { ...audit, entityId: row.id });

      return { ...toInteraction(row, []), references: data.references.map((reference) => ({ ...reference })) };
    });
  },

  async findById(id) {
    const pool = getPool();
    const found = await pool.query<InteractionRow>('SELECT * FROM ai_interactions WHERE id = $1', [id]);
    if (!found.rows[0]) return undefined;
    const references = await pool.query<ReferenceRow>(
      `SELECT authorization_id, source_type, source_id, source_version, title, chunk_index
       FROM ai_interaction_references WHERE interaction_id = $1 ORDER BY id`,
      [id],
    );
    return toInteraction(found.rows[0], references.rows);
  },
};
