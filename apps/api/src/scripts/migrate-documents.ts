import fs from 'node:fs';
import path from 'node:path';
import { getPool } from '../shared/db/pool';

async function main() {
  const pool=getPool();
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(120012)");
    await client.query(`CREATE TABLE IF NOT EXISTS omnidesk_document_migrations
      (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const applied=await client.query("SELECT name FROM omnidesk_document_migrations WHERE name='003_knowledge_documents.sql'");
    if(applied.rowCount) { await client.query('COMMIT');console.log('FR-012: migración ya aplicada.');return; }
    const prerequisites=await client.query("SELECT to_regclass('users') AS users,to_regclass('audit_log') AS audit");
    if(!prerequisites.rows[0].users || !prerequisites.rows[0].audit) {
      throw new Error('Primero aplica las migraciones existentes 001 y 002 de OmniDesk.');
    }
    const sql=fs.readFileSync(path.join(__dirname,'../../db/migrations/003_knowledge_documents.sql'),'utf8')
      .replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
    await client.query(sql);
    await client.query("INSERT INTO omnidesk_document_migrations(name) VALUES ('003_knowledge_documents.sql')");
    await client.query('COMMIT');
    console.log('FR-012: tablas y categorías creadas.');
  } catch(cause) {
    await client.query('ROLLBACK');throw cause;
  } finally {client.release();await pool.end();}
}
main().catch(cause => { console.error(cause instanceof Error ? cause.message : 'No se pudo aplicar la migración.');process.exitCode=1; });
