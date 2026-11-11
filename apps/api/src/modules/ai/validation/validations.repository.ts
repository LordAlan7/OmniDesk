import { getPool } from '../../../shared/db/pool';
import type {
  AiValidationRow,
  RecordValidationInput,
  ApplyValidationInput,
  DestinationType,
} from './validations.types';

export async function insertValidation(input: RecordValidationInput): Promise<AiValidationRow> {
  const pool = getPool();
  const previous = await findLatestForVersion(
    input.interactionId, input.contentVersion, input.destinationType
  );

  const result = await pool.query<AiValidationRow>(
    `INSERT INTO ai_validation
      (interaction_id, proposal_id, content_version, destination_type, destination_id,
       decision, reason, reviewer_id, supersedes_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      input.interactionId, input.proposalId, input.contentVersion, input.destinationType,
      input.destinationId ?? null, input.decision, input.reason, input.reviewerId,
      previous?.id ?? null,
    ]
  );
  return result.rows[0];
}

export async function findLatestForVersion(
  interactionId: number,
  contentVersion: string,
  destinationType: DestinationType
): Promise<AiValidationRow | null> {
  const pool = getPool();
  const r = await pool.query<AiValidationRow>(
    `SELECT * FROM ai_validation
      WHERE interaction_id=$1 AND content_version=$2 AND destination_type=$3
      ORDER BY id DESC LIMIT 1`,
    [interactionId, contentVersion, destinationType]
  );
  return r.rows[0] ?? null;
}

export async function findById(id: number): Promise<AiValidationRow | null> {
  const pool = getPool();
  const r = await pool.query<AiValidationRow>(`SELECT * FROM ai_validation WHERE id=$1`, [id]);
  return r.rows[0] ?? null;
}

export async function listForInteraction(interactionId: number): Promise<AiValidationRow[]> {
  const pool = getPool();
  const r = await pool.query<AiValidationRow>(
    `SELECT * FROM ai_validation WHERE interaction_id=$1 ORDER BY id ASC`,
    [interactionId]
  );
  return r.rows;
}

export async function markApplied(input: ApplyValidationInput): Promise<AiValidationRow> {
  const pool = getPool();
  const r = await pool.query<AiValidationRow>(
    `UPDATE ai_validation
        SET applied_at = now(), applied_by = $2, destination_id = COALESCE(destination_id, $3)
      WHERE id = $1 AND applied_at IS NULL
      RETURNING *`,
    [input.validationId, input.appliedBy, input.destinationId]
  );
  if (!r.rows[0]) {
    const existing = await findById(input.validationId);
    if (!existing) throw new Error('validation_not_found');
    return existing; 
  }
  return r.rows[0];
}