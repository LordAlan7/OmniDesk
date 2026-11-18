
import { getPool } from '../../../shared/db/pool';
import type { AiInteraction } from './interactions';

interface InteractionRow {
  id: number;
  user_id: number;
  ticket_id: number | null;
  question: string;
  answer: string;
  sources: AiInteraction['references'];
  provided_context: AiInteraction['providedContext'];
  citations: AiInteraction['citations'];
  generation_config: AiInteraction['generationConfig'];
  created_at: Date | string;
}

function toInteraction(row: InteractionRow): AiInteraction {
  return {
    id: row.id,
    userId: row.user_id,
    ticketId: row.ticket_id,
    question: row.question,
    answer: row.answer,
    references: row.sources ?? [],
    providedContext: row.provided_context ?? [],
    citations: row.citations ?? [],
    generationConfig: row.generation_config ?? {},
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * FR-015 + AIR-007
 *
 * Persiste la interacción en la tabla compartida
 * con AIR-006 y AIR-007.
 *
 * El ID devuelto proviene de PostgreSQL.
 */
export async function createInteractionInPostgres(
  input: Omit<AiInteraction, 'id' | 'createdAt'>,
): Promise<AiInteraction> {
  const result = await getPool().query<InteractionRow>(
    `
      INSERT INTO ai_interaction (
        user_id,
        ticket_id,
        question,
        answer,
        sources,
        provided_context,
        citations,
        generation_config
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6::jsonb,
        $7::jsonb,
        $8::jsonb
      )
      RETURNING
        id,
        user_id,
        ticket_id,
        question,
        answer,
        sources,
        provided_context,
        citations,
        generation_config,
        created_at
    `,
    [
      input.userId,
      input.ticketId ?? null,
      input.question,
      input.answer,
      JSON.stringify(input.references ?? []),
      JSON.stringify(input.providedContext ?? []),
      JSON.stringify(input.citations ?? []),
      JSON.stringify(input.generationConfig ?? {}),
    ],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error(
      'No se pudo registrar la interacción de IA.',
    );
  }

  return toInteraction(row);
}

/**
 * FR-015
 *
 * Recupera una interacción persistida.
 * El servicio y las rutas comprueban posteriormente
 * la identidad del propietario y las fuentes.
 */
export async function findInteractionInPostgres(
  id: number,
): Promise<AiInteraction | undefined> {
  const result = await getPool().query<InteractionRow>(
    `
      SELECT
        id,
        user_id,
        ticket_id,
        question,
        answer,
        sources,
        provided_context,
        citations,
        generation_config,
        created_at
      FROM ai_interaction
      WHERE id = $1
    `,
    [id],
  );

  const row = result.rows[0];

  return row ? toInteraction(row) : undefined;
}

/**
 * FR-015
 *
 * Lista únicamente interacciones del usuario.
 */
export async function listInteractionsInPostgres(
  userId: number,
): Promise<AiInteraction[]> {
  const result = await getPool().query<InteractionRow>(
    `
      SELECT
        id,
        user_id,
        ticket_id,
        question,
        answer,
        sources,
        provided_context,
        citations,
        generation_config,
        created_at
      FROM ai_interaction
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [userId],
  );

  return result.rows.map(toInteraction);
}
