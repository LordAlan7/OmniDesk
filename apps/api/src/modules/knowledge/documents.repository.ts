import type { PoolClient } from 'pg';
import { getPool } from '../../shared/db/pool';
import type { AuthUser, Role } from '../../shared/types';
import { can, PERMISSIONS } from '../../shared/authorization';
import type { DocumentMetadata, DocumentQuery, Publication } from './documents.schemas';

export interface DocumentRecord extends DocumentMetadata {
  id: number; categoryName: string; createdBy: number; uploadedBy: string;
  createdAt: string; updatedAt: string; status: 'draft' | 'published' | 'retired';
  accessRoles: Role[]; revision: number; versionId: string; aiAuthorized: false;
  fileId: string; originalName: string; sizeBytes: number; sha256: string;
}
const projection = `d.id, a.title, a.description, a.category_id AS "categoryId", c.name AS "categoryName",
  a.created_by AS "createdBy", u.name AS "uploadedBy", a.created_at AS "createdAt", a.updated_at AS "updatedAt",
  d.source, d.source_reference AS "sourceReference", d.edition, to_char(d.document_date,'YYYY-MM-DD') AS "documentDate",
  d.status, d.access_roles AS "accessRoles", d.revision, d.version_id AS "versionId",
  d.ai_authorized AS "aiAuthorized", d.file_id AS "fileId", f.original_name AS "originalName",
  f.size_bytes AS "sizeBytes", f.sha256`;
const tables = `knowledge_documents d JOIN knowledge_articles a ON a.id=d.id
  JOIN knowledge_categories c ON c.id=a.category_id JOIN users u ON u.id=a.created_by
  JOIN stored_files f ON f.id=d.file_id`;
// Same predicate for list, totals, detail and binary downloads.
const visibility = `($1::boolean OR
  (d.status='draft' AND a.created_by=$2) OR
  (d.status='published' AND (cardinality(d.access_roles)=0 OR d.access_roles && $3::text[])))`;
const actorValues = (actor: AuthUser) => [can(actor, PERMISSIONS.KNOWLEDGE_PUBLISH), actor.id, actor.roles];

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export const categories = async () => (await getPool().query('SELECT id,name FROM knowledge_categories ORDER BY name')).rows;
export async function hasCategory(client: PoolClient, id: number) {
  return (await client.query('SELECT id FROM knowledge_categories WHERE id=$1', [id])).rowCount === 1;
}
export async function findDocument(client: PoolClient, id: number, actor: AuthUser, lock = false) {
  return (await client.query<DocumentRecord>(`SELECT ${projection} FROM ${tables}
    WHERE ${visibility} AND d.id=$4 ${lock ? 'FOR UPDATE OF d, a' : ''}`, [...actorValues(actor), id])).rows[0];
}
/** Sin filtro de visibilidad: solo para verificar el estado real de una fuente (AIR-002). */
export async function findDocumentUnrestricted(client: PoolClient, id: number) {
  return (await client.query<DocumentRecord>(`SELECT ${projection} FROM ${tables} WHERE d.id=$1`, [id])).rows[0];
}
export async function listDocuments(actor: AuthUser, query: DocumentQuery) {
  const values = [...actorValues(actor), query.search, query.categoryId ?? null, query.status ?? null];
  const where = `${visibility} AND ($4::text='' OR
    strpos(lower(a.title || ' ' || a.description || ' ' || c.name || ' ' || d.source),lower($4))>0)
    AND ($5::int IS NULL OR a.category_id=$5) AND ($6::text IS NULL OR d.status=$6)`;
  // A repeatable-read snapshot keeps page and total consistent even during publication.
  return transaction(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const count = await client.query(`SELECT count(*)::int AS total FROM ${tables} WHERE ${where}`, values);
    const result = await client.query<DocumentRecord>(`SELECT ${projection} FROM ${tables} WHERE ${where}
      ORDER BY a.created_at DESC,d.id DESC LIMIT $7 OFFSET $8`,
      [...values, query.limit, (query.page-1)*query.limit]);
    return { items: result.rows, total: count.rows[0].total as number };
  });
}
export async function insertDocument(client: PoolClient, data: DocumentMetadata, fileId: string, versionId: string, actorId: number) {
  const article = await client.query<{id:number}>(`INSERT INTO knowledge_articles(title,description,category_id,created_by)
    VALUES ($1,$2,$3,$4) RETURNING id`, [data.title,data.description,data.categoryId,actorId]);
  const id = article.rows[0].id;
  await client.query(`INSERT INTO knowledge_documents(id,source,source_reference,edition,document_date,file_id,version_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id,data.source,data.sourceReference,data.edition,data.documentDate,fileId,versionId]);
  return id;
}
export async function updateMetadata(client: PoolClient, id: number, data: DocumentMetadata) {
  await client.query(`UPDATE knowledge_articles SET title=$2,description=$3,category_id=$4,updated_at=now() WHERE id=$1`,
    [id,data.title,data.description,data.categoryId]);
  await client.query(`UPDATE knowledge_documents SET source=$2,source_reference=$3,edition=$4,document_date=$5,
    revision=revision+1 WHERE id=$1`, [id,data.source,data.sourceReference,data.edition,data.documentDate]);
}
export async function updatePublication(client: PoolClient, id: number, data: Publication) {
  await client.query(`UPDATE knowledge_documents SET status=$2,access_roles=$3,revision=revision+1 WHERE id=$1`,
    [id,data.status,data.accessRoles]);
  await client.query('UPDATE knowledge_articles SET updated_at=now() WHERE id=$1', [id]);
}
