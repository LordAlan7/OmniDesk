import { Router } from 'express';
import { notImplemented } from '../../shared/http';
import { authenticate } from '../../shared/security/guards';

export const reportsRouter = Router();
const REQUIREMENTS = ['FR-016', 'FR-017', 'NFR-012'];

// TODO: implementar cada endpoint (routes -> controller -> service -> repository).
// Endpoints tomados de la sección "API design" del documento de diseño.
const handler = notImplemented('reports', REQUIREMENTS);

reportsRouter.get('/reports/overview', authenticate, handler);
reportsRouter.get('/reports/tickets', authenticate, handler);
reportsRouter.get('/reports/workload', authenticate, handler);
