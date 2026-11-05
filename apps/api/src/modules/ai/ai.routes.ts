import { Router } from 'express';
import { notImplemented, ok, parseId } from '../../shared/http';
import { PERMISSIONS, requirePermission } from '../../shared/authorization';
import { authenticate, currentUser } from '../../shared/security/guards';
import { getInteractionForUser } from './interactions/interactions';
import { aiSourcesRouter } from './sources/sources.routes';

export const aiRouter = Router();
const REQUIREMENTS = ['FR-013', 'FR-014', 'FR-015', 'FR-021', 'NFR-003'];

// TODO: implementar cada endpoint (routes -> controller -> service -> repository).
// Endpoints tomados de la sección "API design" del documento de diseño.
const handler = notImplemented('ai', REQUIREMENTS);

// AIR-002: fuentes autorizadas (la recuperación filtrada que usará el flujo RAG de FR-013).
aiRouter.use(aiSourcesRouter);

// AIR-008: el permiso se exige ya en el placeholder para que conectar FR-013 no deje el endpoint abierto.
// El cuerpo de /ai/ask debe validarse con zod `.strict()` (sin roles, alcances ni listas de fuentes del cliente).
aiRouter.post('/ai/ask', authenticate, requirePermission(PERMISSIONS.AI_QUERY), handler);

// Solo el dueño abre su interacción; las referencias se revalidan con los permisos actuales.
aiRouter.get('/ai/interactions/:id', authenticate, requirePermission(PERMISSIONS.AI_INTERACTIONS_READ), async (req, res, next) => {
  try {
    ok(res, await getInteractionForUser(parseId(req.params.id), currentUser(req)));
  } catch (cause) {
    next(cause);
  }
});
