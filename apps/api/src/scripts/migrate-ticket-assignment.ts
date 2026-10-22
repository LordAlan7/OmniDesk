import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getPool } from '../shared/db/pool';

async function main(): Promise<void> {
  const pool = getPool();

  try {
    const migrationPath = resolve(
      process.cwd(),
      'db/migrations/004_ticket_assignment.sql',
    );

    const sql = await readFile(migrationPath, 'utf8');

    // Una misma conexión ejecuta toda la transacción.
    const client = await pool.connect();

    try {
      await client.query(sql);
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }

    const result = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          (table_name = 'tickets' AND column_name = 'version')
          OR
          (table_name = 'ticket_history' AND column_name = 'reason')
        )
      ORDER BY table_name, column_name
    `);

    if (result.rows.length !== 2) {
      throw new Error(
        'No se encontraron las dos columnas esperadas.',
      );
    }

    console.table(result.rows);
    console.log('Migración de asignación aplicada correctamente.');
  } finally {
    await pool.end();
  }
}

main().catch((cause: unknown) => {
  console.error(
    cause instanceof Error ? cause.message : 'Error de migración.',
  );
  process.exitCode = 1;
});
