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

/**
 * FR-009: valida que un artículo de conocimiento exista y esté aprobado, para
 * usarlo como referencia al documentar una investigación o una resolución.
 *
 * Reglas:
 * - El artículo debe existir. Si no existe → lanza notFound.
 * - El artículo debe estar en estado 'approved'. Si está 'draft' o 'retired' →
 *   lanza validation (no se puede usar un borrador ni un retirado como referencia).
 * - La visibilidad del artículo al usuario que lo referencia se delega al flujo
 *   normal de FR-011 (getArticle); aquí solo validamos la existencia y el estado.
 *
 * Devuelve el artículo aprobado (para que el caller pueda, opcionalmente, copiar
 * su título en la respuesta). Nunca copia el contenido (solution) — la referencia
 * es por id, no por texto (FR-009: "Guardar la referencia al artículo utilizado
 * sin copiar innecesariamente su contenido").
 */
export async function findApprovedArticleForReference(
  articleId: number,
  user: AuthUser,
): Promise<KnowledgeArticle> {
  const article = await repo.findById(articleId);

  if (!article) {
    throw Errors.notFound('Knowledge article');
  }

  if (article.status !== 'approved') {
    throw Errors.validation([
      {
        field: 'knowledgeArticleId',
        message:
          'Solo se pueden referenciar artículos de conocimiento aprobados.',
      },
    ]);
  }

  // FR-011 ya decide quién puede ver borradores/retirados; aquí solo garantizamos
  // que el usuario tenga al menos permiso de lectura de conocimiento.
  if (!can(user, PERMISSIONS.KNOWLEDGE_READ)) {
    throw Errors.forbidden();
  }

  return article;
}

/**
 * FR-009: consulta un artículo aprobado por id, sin verificar permisos del
 * usuario. La usa el módulo tickets (vía inyección en app.ts) para validar
 * referencias a artículos de conocimiento al documentar investigaciones y
 * resoluciones.
 *
 * Reglas:
 * - Solo devuelve el artículo si existe y está en estado 'approved'.
 * - Si no existe o no está aprobado, devuelve null (el caller decide qué hacer).
 * - No devuelve el contenido (solution), solo { id, title }: la referencia es
 *   por id, no por texto (FR-009: "sin copiar innecesariamente su contenido").
 *
 * Esta función es intencionalmente pública y sin usuario: los artículos
 * aprobados son legibles por cualquier usuario autenticado (FR-011), por lo
 * que validar la referencia no requiere verificar permisos del técnico que
 * la usa.
 */
export async function findApprovedArticleById(
  articleId: number,
): Promise<{ id: number; title: string } | null> {
  const article = await repo.findById(articleId);
  if (!article || article.status !== 'approved') return null;
  return { id: article.id, title: article.title };
}