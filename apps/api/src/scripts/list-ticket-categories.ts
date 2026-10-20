import { getPool } from '../shared/db/pool';

async function main(): Promise<void> {
  const pool = getPool();

  try {
    const result = await pool.query<{
      id: number;
      name: string;
    }>(
      'SELECT id, name FROM ticket_categories ORDER BY id',
    );

    console.table(result.rows);

    if (result.rows.length === 0) {
      console.log('No hay categorías registradas.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((cause: unknown) => {
  console.error(
    cause instanceof Error ? cause.message : 'Error al consultar categorías.',
  );
  process.exitCode = 1;
});