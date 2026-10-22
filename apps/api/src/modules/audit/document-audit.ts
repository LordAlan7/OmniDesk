import type { DatabaseClient as PoolClient } from '../../shared/db/types';
/** Persistent document events share the mutation's transaction. */
export async function recordDocumentAudit(client: PoolClient, action: string, entityId: number,
  actorId: number, metadata: Record<string, unknown>) {
  await client.query(`INSERT INTO audit_log(action,entity,entity_id,actor_id,metadata)
    VALUES ($1,'knowledge_document',$2,$3,$4::jsonb)`, [action, entityId, actorId, JSON.stringify(metadata)]);
}

export async function readDocumentAudit(client: PoolClient, entityId: number) {
  return (await client.query(`SELECT id,action,actor_id AS "actorId",metadata,created_at AS "createdAt"
    FROM audit_log WHERE entity='knowledge_document' AND entity_id=$1 ORDER BY id DESC`,[entityId])).rows;
}
