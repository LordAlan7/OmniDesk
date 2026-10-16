import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import {
  errorHandler,
  notFoundHandler,
} from './shared/middleware/errorHandler';
import { requestId } from './shared/middleware/requestId';
import {
  configureAccountResolver,
} from './shared/security/guards';

import { aiRouter } from './modules/ai';
import { auditRouter } from './modules/audit';
import { authRouter } from './modules/auth';
import { filesRouter } from './modules/files';
import { knowledgeRouter } from './modules/knowledge';
import { notificationsRouter } from './modules/notifications';
import { reportsRouter } from './modules/reports';
import {
  ticketsRouter,
  hasPendingTicketsForTechnician,
} from './modules/tickets';
import {
  usersRouter,
  findUserById,
  configurePendingTicketsChecker,
} from './modules/users';

export function createApp() {
  configureAccountResolver(findUserById);

  configurePendingTicketsChecker(
    hasPendingTicketsForTechnician,
  );

  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestId);

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