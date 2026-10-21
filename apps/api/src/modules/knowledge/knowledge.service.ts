import { AuthUser } from '../../shared/types';
import { Errors } from '../../shared/errors';
import { PERMISSIONS, can } from '../../shared/authorization';
import { recordAudit } from '../audit';
import { knowledgeRepository as repo } from './knowledge.repository';
import { KnowledgeArticle, KnowledgeFilter, KnowledgeStatus } from './knowledge.types';

function canManageKnowledge(user: AuthUser): boolean {
  return can(user, PERMISSIONS.KNOWLEDGE_CREATE) && can(user, PERMISSIONS.KNOWLEDGE_UPDATE);
}

// Los borradores solo los ve el autor o alguien con permiso de publicación
function canView(article: KnowledgeArticle, user: AuthUser): boolean {
  if (article.status === 'approved') return true; // Todos ven los aprobados
  if (can(user, PERMISSIONS.KNOWLEDGE_PUBLISH)) return true; // Managers ven todo
  return article.authorId === user.id; // Autores ven sus borradores
}

export async function createArticle(data: any, user: AuthUser) {
  if (!canManageKnowledge(user)) throw Errors.forbidden('No tienes permiso para crear artículos.');
  const article = await repo.create({ ...data, authorId: user.id });
  recordAudit({ action: 'knowledge.created', entity: 'article', entityId: article.id, actorId: user.id });
  return article;
}

export async function searchArticles(filter: KnowledgeFilter, page: number, limit: number, user: AuthUser) {
  // Por simplicidad, si no es Manager, solo buscamos en aprobados
  const effectiveFilter = can(user, PERMISSIONS.KNOWLEDGE_PUBLISH) 
    ? filter 
    : { ...filter, status: 'approved' as KnowledgeStatus };
    
  return repo.search(effectiveFilter, page, limit);
}

export async function getArticle(id: number, user: AuthUser) {
  const article = await repo.findById(id);
  if (!article || !canView(article, user)) throw Errors.notFound('Article');
  return article;
}

export async function updateArticle(id: number, patch: any, user: AuthUser) {
  if (!canManageKnowledge(user)) throw Errors.forbidden();
  const article = await getArticle(id, user);
  
  if (article.version !== patch.version) throw Errors.conflict('El artículo fue modificado por otro usuario.');

  Object.assign(article, patch);
  
  // Si estaba aprobado y se edita, vuelve a borrador (regla editorial)
  if (article.status === 'approved' && !can(user, PERMISSIONS.KNOWLEDGE_PUBLISH)) {
    article.status = 'draft'; 
  }

  const saved = await repo.save(article);
  recordAudit({ action: 'knowledge.updated', entity: 'article', entityId: id, actorId: user.id });
  return saved;
}

export async function changeStatus(id: number, status: KnowledgeStatus, version: number, user: AuthUser) {
  if (!can(user, PERMISSIONS.KNOWLEDGE_PUBLISH)) throw Errors.forbidden('Solo gerentes pueden aprobar o retirar.');
  const article = await getArticle(id, user);
  
  if (article.version !== version) throw Errors.conflict('El artículo fue modificado.');

  article.status = status;
  const saved = await repo.save(article);
  recordAudit({ action: `knowledge.${status}`, entity: 'article', entityId: id, actorId: user.id });
  return saved;
}