import { Router } from 'express';
import { notImplemented } from '../../shared/http';
import { authenticate } from '../../shared/security/guards';

export const knowledgeRouter = Router();
const REQUIREMENTS = ['FR-011', 'FR-012', 'FR-019'];

// TODO: implementar cada endpoint (routes -> controller -> service -> repository).
// Endpoints tomados de la sección "API design" del documento de diseño.
const handler = notImplemented('knowledge', REQUIREMENTS);

knowledgeRouter.get('/knowledge/articles', authenticate, handler);
knowledgeRouter.get('/knowledge/articles/:id', authenticate, handler);
knowledgeRouter.post('/knowledge/articles', authenticate, handler);
knowledgeRouter.patch('/knowledge/articles/:id', authenticate, handler);
knowledgeRouter.delete('/knowledge/articles/:id', authenticate, handler);
knowledgeRouter.get('/knowledge/categories', authenticate, handler);
