
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getPool } from '../shared/db/pool';

const MIGRATION_FILE = '016_fr021_quotation_foundation.sql';

async function main(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const prerequisites = await client.query<{
      tickets: string | null;
      users: string | null;
      ai_interaction: string | null;
    }>(`
      SELECT
        to_regclass('tickets') AS tickets,
        to_regclass('users') AS users,
        to_regclass('ai_interaction') AS ai_interaction
    `);

    const tables = prerequisites.rows[0];

    if (
      !tables.tickets ||
      !tables.users ||
      !tables.ai_interaction
    ) {
      throw new Error(
        'Faltan tablas necesarias. Verifica que las migraciones de tickets, usuarios e IA estén aplicadas.',
      );
    }

    const migrationPath = resolve(
      process.cwd(),
      'db/migrations',
      MIGRATION_FILE,
    );

    const sql = await readFile(migrationPath, 'utf8');

    await client.query(sql);

    console.log('FR-021: migración de cotizaciones aplicada correctamente.');
    console.log('Tablas creadas: quotations, quotation_versions, quotation_items.');
  } catch (cause) {
    console.error(
      cause instanceof Error
        ? cause.message
        : 'No se pudo aplicar la migración de cotizaciones.',
    );

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((cause: unknown) => {
  console.error(
    cause instanceof Error
      ? cause.message
      : 'Error al ejecutar la migración.',
  );

  process.exitCode = 1;
});
