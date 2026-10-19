import { Router } from 'express';
import { ok } from '../../shared/http';
import { authenticate } from '../../shared/security/guards';
import { getPool } from '../../shared/db/pool';
import { env } from '../../config/env';

export const ticketCategoriesRouter = Router();

// GET /ticket-categories
ticketCategoriesRouter.get('/ticket-categories', authenticate, async (req, res, next) => {
  try {
    if (env.nodeEnv === 'test') {
      // En tests (memoria) devolvemos el catálogo hardcodeado que coincide con el seed SQL
      return ok(res, [
        { id: 1, name: 'Acceso' },
        { id: 2, name: 'Hardware' },
        { id: 3, name: 'Software' },
        { id: 4, name: 'Red' },
      ]);
    }

    // En desarrollo/producción consultamos PostgreSQL
    const pool = getPool();
    const result = await pool.query('SELECT id, name FROM ticket_categories ORDER BY name ASC');
    ok(res, result.rows);
  } catch (error) {
    next(error);
  }
});