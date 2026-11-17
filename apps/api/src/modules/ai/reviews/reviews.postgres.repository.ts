import { getPool } from '../../../shared/db/pool';
import type { AiReview } from './reviews';

interface ReviewRow {
  id: number;
  interaction_id: number;
  reviewer_id: number;
  decision: AiReview['decision'];
  reason: string;
  supersedes_id: number | null;
  follow_up_interaction_id: number | null;
  reviewed_at: Date;
}

function toReview(row: ReviewRow): AiReview {
  return {
    id: row.id,
    interactionId: row.interaction_id,
    reviewerId: row.reviewer_id,
    decision: row.decision,
    reason: row.reason,
    supersedesId: row.supersedes_id ?? undefined,
    followUpInteractionId:
      row.follow_up_interaction_id ?? undefined,
    reviewedAt: row.reviewed_at.toISOString(),
  };
}

export async function createReviewInPostgres(
  input: Omit<AiReview, 'id' | 'reviewedAt'>,
): Promise<AiReview> {
  const result = await getPool().query<ReviewRow>(
    `INSERT INTO ai_validations
       (interaction_id, reviewer_id, decision,
        reason, supersedes_id, follow_up_interaction_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.interactionId,
      input.reviewerId,
      input.decision,
      input.reason,
      input.supersedesId ?? null,
      input.followUpInteractionId ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error('No se pudo registrar la validación');

  return toReview(row);
}

export async function findActiveReviewInPostgres(
  interactionId: number,
): Promise<AiReview | undefined> {
  const result = await getPool().query<ReviewRow>(
    `SELECT * FROM ai_validations
     WHERE interaction_id = $1
     ORDER BY reviewed_at DESC, id DESC
     LIMIT 1`,
    [interactionId],
  );

  return result.rows[0]
    ? toReview(result.rows[0])
    : undefined;
}

export async function listReviewsInPostgres(
  interactionId: number,
): Promise<AiReview[]> {
  const result = await getPool().query<ReviewRow>(
    `SELECT * FROM ai_validations
     WHERE interaction_id = $1
     ORDER BY reviewed_at ASC, id ASC`,
    [interactionId],
  );

  return result.rows.map(toReview);
}

export async function attachFollowUpInPostgres(
  reviewId: number,
  followUpInteractionId: number,
): Promise<void> {
  await getPool().query(
    `UPDATE ai_validations
     SET follow_up_interaction_id = $2
     WHERE id = $1`,
    [reviewId, followUpInteractionId],
  );
}
