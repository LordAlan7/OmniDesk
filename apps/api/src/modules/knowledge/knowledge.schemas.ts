import { z } from 'zod';
import { paginationSchema } from '../../shared/http';
import { MESSAGES } from '../../shared/validation';

export const createArticleSchema = z
  .object({
    title: z.string().trim().min(5, MESSAGES.tooShort('El título', 5)).max(200),
    problemDescription: z.string().trim().min(10, MESSAGES.tooShort('La descripción del problema', 10)).max(5000),
    solution: z.string().trim().min(10, MESSAGES.tooShort('La solución', 10)).max(10000),
    categoryId: z.number().int().positive(MESSAGES.positiveInt('categoryId')),
  })
  .strict();

export const updateArticleSchema = z
  .object({
    title: z.string().trim().min(5).max(200).optional(),
    problemDescription: z.string().trim().min(10).max(5000).optional(),
    solution: z.string().trim().min(10).max(10000).optional(),
    categoryId: z.number().int().positive().optional(),
    version: z.number().int().positive(MESSAGES.positiveInt('version')),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, {
    message: MESSAGES.noFieldsToUpdate,
  });

export const searchArticlesSchema = paginationSchema.extend({
  text: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export const statusChangeSchema = z
  .object({
    status: z.enum(['draft', 'approved', 'retired']),
    version: z.number().int().positive(),
  })
  .strict();