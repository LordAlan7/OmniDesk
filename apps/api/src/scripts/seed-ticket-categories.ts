import { getPool } from '../shared/db/pool';

async function main(): Promise<void> {
  const pool = getPool();

  try {
    const categories = [
      'Ensamblado',
      'Activado',
      'Problema de tienda',
    ];

    await pool.query(
      `INSERT INTO ticket_categories (name)
       SELECT unnest($1::text[])
       ON CONFLICT (name) DO NOTHING`,
      [categories],
    );

    const result = await pool.query<{
      id: number;
      name: string;
    }>(
      'SELECT id, name FROM ticket_categories ORDER BY id',
    );

    console.table(result.rows);
    console.log('Categorías registradas correctamente.');
  } finally {
    await pool.end();
  }
}

main().catch((cause: unknown) => {
  console.error(
    cause instanceof Error
      ? cause.message
      : 'Error al registrar categorías.',
  );
  process.exitCode = 1;
});
