import { Router } from 'express';
import { ok } from '../../shared/http';
import { authenticate } from '../../shared/security/guards';
import { listCategories } from './tickets.service';

export const ticketCategoriesRouter = Router();

ticketCategoriesRouter.get('/ticket-categories', authenticate, async (_req, res, next) => {
  try {
    ok(res, await listCategories());
  } catch (error) {
    next(error);
  }
});
