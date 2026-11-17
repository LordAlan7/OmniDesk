import { getPool } from '../../../shared/db/pool';
import type { AiInteraction } from './interactions';

interface InteractionRow {
  id: number;
  user_id: number;
  ticket_id: number | null;
  question: string;
  answer: string;
  reference_data: AiInteraction['references'];
  created_at: Date;
}

function toInteraction(row: InteractionRow): AiInteraction {
  return {
    id: row.id,
    userId: row.user_id,
    ticketId: row.ticket_id,
    question: row.question,
    answer: row.answer,
    references: row.reference_data,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createInteractionInPostgres(
  input: Omit<AiInteraction, 'id' | 'createdAt'>,
): Promise<AiInteraction> {
  const result = await getPool().query<InteractionRow>(
    `INSERT INTO ai_interactions
       (user_id, ticket_id, question, answer, reference_data)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [
      input.userId,
      input.ticketId ?? null,
      input.question,
      input.answer,
      JSON.stringify(input.references),
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error('No se pudo registrar la interacción');

  return toInteraction(row);
}

export async function findInteractionInPostgres(
  id: number,
): Promise<AiInteraction | undefined> {
  const result = await getPool().query<InteractionRow>(
    'SELECT * FROM ai_interactions WHERE id = $1',
    [id],
  );

  return result.rows[0]
    ? toInteraction(result.rows[0])
    : undefined;
}

export async function listInteractionsInPostgres(
  userId: number,
): Promise<AiInteraction[]> {
  const result = await getPool().query<InteractionRow>(
    `SELECT * FROM ai_interactions
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );

  return result.rows.map(toInteraction);
}
