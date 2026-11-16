import { Router } from 'express';
import { ok, paginated, parseId } from '../../shared/http';
import { authenticate, currentUser } from '../../shared/security/guards';
import { 
  createArticleSchema, 
  searchArticlesSchema, 
  updateArticleSchema, 
  statusChangeSchema 
} from './knowledge.schemas';
import * as service from './knowledge.service';

// Recuperamos el router de documentos (FR-012) que habíamos perdido
import { documentsRouter } from './documents.routes';

export const knowledgeRouter = Router();

// ============================================================================
// FR-011: Rutas de la Biblioteca de Conocimiento (Artículos)
// ============================================================================

knowledgeRouter.get('/knowledge/articles', authenticate, async (req, res, next) => {
  try {
    const { page, limit, ...filters } = searchArticlesSchema.parse(req.query);
    const result = await service.searchArticles(filters, page, limit, currentUser(req));
    res.json({ data: result.items, meta: { page, limit, total: result.total } });
  } catch (err) { 
    next(err); 
  }
});

knowledgeRouter.get('/knowledge/articles/:id', authenticate, async (req, res, next) => {
  try {
    ok(res, await service.getArticle(parseId(req.params.id), currentUser(req)));
  } catch (err) { 
    next(err); 
  }
});

knowledgeRouter.post('/knowledge/articles', authenticate, async (req, res, next) => {
  try {
    const body = createArticleSchema.parse(req.body);
    ok(res, await service.createArticle(body, currentUser(req)), 201);
  } catch (err) { 
    next(err); 
  }
});

knowledgeRouter.patch('/knowledge/articles/:id', authenticate, async (req, res, next) => {
  try {
    const body = updateArticleSchema.parse(req.body);
    ok(res, await service.updateArticle(parseId(req.params.id), body, currentUser(req)));
  } catch (err) { 
    next(err); 
  }
});

knowledgeRouter.patch('/knowledge/articles/:id/status', authenticate, async (req, res, next) => {
  try {
    const { status, version } = statusChangeSchema.parse(req.body);
    ok(res, await service.changeStatus(parseId(req.params.id), status, version, currentUser(req)));
  } catch (err) { 
    next(err); 
  }
});

// ============================================================================
// FR-012: Rutas de Documentos (Manuales y Documentación Técnica)
// ============================================================================

// Delegamos todas las rutas que empiezan con /knowledge/documents al router de Alexis/Mariana
knowledgeRouter.use(documentsRouter);