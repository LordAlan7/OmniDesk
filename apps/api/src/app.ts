import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import {
  errorHandler,
  notFoundHandler,
} from './shared/middleware/errorHandler';
import { enforceHttps } from './shared/middleware/https';
import { apiRateLimiter } from './shared/middleware/rateLimit';
import { requestId } from './shared/middleware/requestId';
import {
  configureAccountResolver,
} from './shared/security/guards';

import { aiRouter } from './modules/ai';
import { auditRouter } from './modules/audit';
import { authRouter } from './modules/auth';
import { filesRouter } from './modules/files';
import { knowledgeRouter, findApprovedArticleById } from './modules/knowledge';
import { getArticle } from './modules/knowledge/knowledge.service';
import { notificationsRouter } from './modules/notifications';
import { reportsRouter } from './modules/reports';
import {
  ticketsRouter,
  hasPendingTicketsForTechnician,
  configureArticleReferenceChecker,
} from './modules/tickets';
import {
  usersRouter,
  findUserById,
  configurePendingTicketsChecker,
} from './modules/users';
import { ticketCategoriesRouter } from './modules/tickets/tickets.categories.routes';



export function createApp() {
  configureAccountResolver(findUserById);

  configurePendingTicketsChecker(
    hasPendingTicketsForTechnician,
  );

// FR-009: el módulo tickets valida referencias a artículos de conocimiento (FR-011)
// mediante inyección de dependencia. Así se rompe el ciclo
// tickets → knowledge → files → tickets, respetando architecture.test.ts.
  configureArticleReferenceChecker(
    findApprovedArticleById
  );

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);
  app.use(enforceHttps);
  app.use(
    helmet({
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    }),
  );
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestId);
  app.use('/api/v1', apiRateLimiter);

  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({
      data: {
        status: 'ok',
        service: 'omnidesk-api',
      },
    });
  });

  api.use(authRouter);
  api.use(usersRouter);
  api.use(ticketsRouter);
  api.use(ticketCategoriesRouter);
  api.use(filesRouter);
  api.use(knowledgeRouter);
  api.use(aiRouter);
  api.use(reportsRouter);
  api.use(notificationsRouter);
  api.use(auditRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

