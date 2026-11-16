import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { Errors } from './errors';

/** Respuesta exitosa: { data } */
export const ok = <T>(res: Response, data: T, status = 200): void => {
  res.status(status).json({ data });
};

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginated<T>(res: Response, items: T[], page: number, limit: number): void {
  const start = (page - 1) * limit;
  res.json({
    data: items.slice(start, start + limit),
    meta: { page, limit, total: items.length },
  });
}

const idSchema = z.coerce.number().int().positive();

export function parseId(value: unknown, field = 'id'): number {
  const result = idSchema.safeParse(value);
  if (!result.success) {
    throw Errors.validation([{ field, message: `${field} must be a positive integer.` }]);
  }
  return result.data;
}

/** Handler provisional para endpoints del diseño que aún no se implementan. */
export const notImplemented =
  (module: string, requirements: string[]): RequestHandler =>
  (req: Request, res: Response) => {
    res.status(501).json({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: `Endpoint planned in module "${module}" (${requirements.join(', ')}) is not implemented yet.`,
        requestId: req.requestId,
      },
    });
  };
