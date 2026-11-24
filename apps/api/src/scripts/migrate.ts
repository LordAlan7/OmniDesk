import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getPool } from '../shared/db/pool';

const LOCK_ID = 734920261;
const EXCLUDED_FILES = new Set([
  '005_ticket_business_info.sql',
]);

async function main() {
  const pool = getPool();
  let client: Awaited<ReturnType<typeof pool.connect>> | undefined;
  let lockAcquired = false;

  try {
    client = await pool.connect();

    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.omnidesk_schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = resolve(process.cwd(), 'db/migrations');

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .filter((file) => !EXCLUDED_FILES.has(file))
      .sort((a, b) => {
        const numberA = Number(a.match(/^(\d+)/)?.[1] ?? 0);
        const numberB = Number(b.match(/^(\d+)/)?.[1] ?? 0);

        return numberA - numberB || a.localeCompare(b);
      });

    if (files.length === 0) {
      throw new Error(`No se encontraron migraciones en ${migrationsDir}`);
    }

    console.log(`\nMigraciones encontradas: ${files.length}\n`);

    let applied = 0;
    let skipped = 0;

    for (const filename of files) {
      const filePath = resolve(migrationsDir, filename);
      const originalSql = await readFile(filePath, 'utf8');
      const checksum = createHash('sha256')
        .update(originalSql)
        .digest('hex');

      const existing = await client.query(
        'SELECT checksum FROM public.omnidesk_schema_migrations WHERE filename = $1',
        [filename],
      );

      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(
            `La migración ${filename} fue modificada después de aplicarse. No se continuará.`,
          );
        }

        console.log(`[OMITIDA] ${filename}`);
        skipped++;
        continue;
      }

      const sql = originalSql
        .replace(/^\s*(?:--[^\r\n]*\r?\n\s*)*BEGIN\s*;\s*/i, '')
        .replace(/\s*COMMIT\s*;\s*$/i, '');

      console.log(`[EJECUTANDO] ${filename}`);

      await client.query('BEGIN');

      try {
        await client.query(sql);

        await client.query(
          `INSERT INTO public.omnidesk_schema_migrations (filename, checksum)
           VALUES ($1, $2)`,
          [filename, checksum],
        );

        await client.query('COMMIT');

        console.log(`[OK] ${filename}`);
        applied++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `Falló la migración ${filename}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    console.log('\n========== RESULTADO ==========');
    console.log(`Aplicadas: ${applied}`);
    console.log(`Ya aplicadas: ${skipped}`);
    console.log('Proceso de migraciones terminado.');
  } finally {
    if (client && lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    }

    client?.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\nERROR EN MIGRACIONES:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
