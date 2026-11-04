import { Router } from 'express';
import { notImplemented } from '../../shared/http';
import { authenticate } from '../../shared/security/guards';
import { aiSourcesRouter } from './sources/sources.routes';

export const aiRouter = Router();
const REQUIREMENTS = ['FR-013', 'FR-014', 'FR-015', 'FR-021', 'NFR-003'];

// TODO: implementar cada endpoint (routes -> controller -> service -> repository).
// Endpoints tomados de la sección "API design" del documento de diseño.
const handler = notImplemented('ai', REQUIREMENTS);

// AIR-002: fuentes autorizadas (la recuperación filtrada que usará el flujo RAG de FR-013).
aiRouter.use(aiSourcesRouter);

aiRouter.post('/ai/ask', authenticate, handler);
aiRouter.get('/ai/interactions/:id', authenticate, handler);
