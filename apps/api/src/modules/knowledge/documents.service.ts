import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { can, PERMISSIONS } from '../../shared/authorization';
import { Errors } from '../../shared/errors';
import type { AuthUser } from '../../shared/types';
import { validateDocumentPdf, storeDocumentFile, readDocumentFile } from '../files';
import { recordDocumentAudit, readDocumentAudit } from '../audit';
import * as repository from './documents.repository';
import type { DocumentMetadata, DocumentQuery, Publication } from './documents.schemas';

export function publicDocument(record: repository.DocumentRecord) {
  const { fileId: _private, ...metadata } = record;
  return metadata;
}
function requireAction(actor: AuthUser, permission: typeof PERMISSIONS[keyof typeof PERMISSIONS]) {
  if (!can(actor, permission)) throw Errors.forbidden();
}
async function accessible(client: PoolClient, id: number, actor: AuthUser, lock = false) {
  requireAction(actor, PERMISSIONS.KNOWLEDGE_READ);
  const doc = await repository.findDocument(client, id, actor, lock);
  if (!doc) throw Errors.notFound('Document'); // Also hides existence of restricted records.
  return doc;
}
function checkRevision(actual: number, expected: number) {
  if (actual !== expected) throw Errors.conflict('El documento cambió. Vuelve a consultarlo antes de guardar.');
}
export const categories = repository.categories;
export async function list(actor: AuthUser, query: DocumentQuery) {
  requireAction(actor, PERMISSIONS.KNOWLEDGE_READ);
  const result = await repository.listDocuments(actor, query);
  return { ...result, items: result.items.map(publicDocument) };
}
export async function detail(id: number, actor: AuthUser) {
  return repository.transaction(async client => publicDocument(await accessible(client,id,actor)));
}
export async function create(data: DocumentMetadata, file: Express.Multer.File | undefined, actor: AuthUser) {
  requireAction(actor, PERMISSIONS.KNOWLEDGE_CREATE);
  await validateDocumentPdf(file);
  return repository.transaction(async client => {
    if (!await repository.hasCategory(client,data.categoryId)) throw Errors.validation([{field:'categoryId',message:'Categoría inexistente.'}]);
    const fileId = await storeDocumentFile(client,file!);
    const versionId = randomUUID();
    const id = await repository.insertDocument(client,data,fileId,versionId,actor.id);
    await recordDocumentAudit(client,'document.created',id,actor.id,{versionId,metadata:data});
    return publicDocument((await repository.findDocument(client,id,actor))!);
  });
}
export async function edit(id: number, data: DocumentMetadata & {revision:number}, actor: AuthUser) {
  requireAction(actor, PERMISSIONS.KNOWLEDGE_UPDATE);
  return repository.transaction(async client => {
    const before = await accessible(client,id,actor,true);
    if (before.createdBy !== actor.id && !can(actor,PERMISSIONS.KNOWLEDGE_PUBLISH)) throw Errors.forbidden();
    if (before.status !== 'draft') throw Errors.conflict('Devuelve el documento a borrador antes de editarlo.');
    checkRevision(before.revision,data.revision);
    if (!await repository.hasCategory(client,data.categoryId)) throw Errors.validation([{field:'categoryId',message:'Categoría inexistente.'}]);
    await repository.updateMetadata(client,id,data);
    const after = (await repository.findDocument(client,id,actor))!;
    await recordDocumentAudit(client,'document.metadata.updated',id,actor.id,{before:publicDocument(before),after:publicDocument(after)});
    return publicDocument(after);
  });
}
export async function publish(id: number, data: Publication, actor: AuthUser) {
  requireAction(actor,PERMISSIONS.KNOWLEDGE_PUBLISH);
  return repository.transaction(async client => {
    const before = await accessible(client,id,actor,true);
    checkRevision(before.revision,data.revision);
    await repository.updatePublication(client,id,data);
    const after = (await repository.findDocument(client,id,actor))!;
    await recordDocumentAudit(client,'document.publication.updated',id,actor.id,{before:publicDocument(before),after:publicDocument(after)});
    return publicDocument(after);
  });
}
export async function content(id: number, actor: AuthUser) {
  return repository.transaction(async client => {
    const doc = await accessible(client,id,actor,true);
    return readDocumentFile(client,doc.fileId);
  });
}

export async function history(id: number, actor: AuthUser) {
  requireAction(actor,PERMISSIONS.AUDIT_READ);
  return repository.transaction(async client => {
    await accessible(client,id,actor);
    return readDocumentAudit(client,id);
  });
}
