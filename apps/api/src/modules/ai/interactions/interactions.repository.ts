import { getPool } from '../../../shared/db/pool';
import type { RecordInteractionInput } from './interactions';

export async function saveInteractionToDb(
  input: RecordInteractionInput,
  createdAt: string
): Promise<number> {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO ai_interaction 
      (user_id, ticket_id, question, answer, sources, provided_context, citations, generation_config, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      input.userId,
      input.ticketId ?? null,
      input.question,
      input.answer,
      JSON.stringify(input.references),
      JSON.stringify(input.providedContext || []),
      JSON.stringify(input.citations || []),
      JSON.stringify(input.generationConfig || {}),
      createdAt
    ]
  );
  return res.rows[0].id;
}