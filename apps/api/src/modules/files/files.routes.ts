import { Router } from 'express';
import { notImplemented } from '../../shared/http';
import { authenticate } from '../../shared/security/guards';

export const filesRouter = Router();
const REQUIREMENTS = ['FR-004', 'FR-012'];

// TODO: implementar cada endpoint (routes -> controller -> service -> repository).
// Endpoints tomados de la sección "API design" del documento de diseño.
const handler = notImplemented('files', REQUIREMENTS);

filesRouter.get('/tickets/:id/attachments', authenticate, handler);
filesRouter.post('/tickets/:id/attachments', authenticate, handler);
filesRouter.get('/attachments/:id', authenticate, handler);
filesRouter.delete('/attachments/:id', authenticate, handler);
