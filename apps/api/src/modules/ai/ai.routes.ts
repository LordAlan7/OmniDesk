import { Router } from 'express';
import { notImplemented } from '../../shared/http';
import { authenticate } from '../../shared/security/guards';

export const aiRouter = Router();
const REQUIREMENTS = ['FR-013', 'FR-014', 'FR-015', 'FR-021', 'NFR-003'];

// TODO: implementar cada endpoint (routes -> controller -> service -> repository).
// Endpoints tomados de la sección "API design" del documento de diseño.
const handler = notImplemented('ai', REQUIREMENTS);

aiRouter.post('/ai/ask', authenticate, handler);
aiRouter.get('/ai/interactions/:id', authenticate, handler);
