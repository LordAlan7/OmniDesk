import { z } from 'zod';
import { ROLES } from '../../shared/types';
import { paginationSchema } from '../../shared/http';
const optionalText = (limit: number) => z.string().trim().max(limit).nullable().optional().transform(v => v || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === v;
}, 'Fecha inválida.').nullable().optional();
export const documentMetadata = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  categoryId: z.coerce.number().int().positive(),
  source: z.string().trim().min(1).max(300),
  sourceReference: optionalText(1000),
  edition: optionalText(100),
  documentDate: date.transform(v => v || null),
}).strict();
export const documentPatch = documentMetadata.extend({ revision: z.number().int().positive() });
export const publicationSchema = z.object({
  status: z.enum(['draft', 'published', 'retired']),
  accessRoles: z.array(z.enum(ROLES)).max(5).transform(v => [...new Set(v)]),
  revision: z.number().int().positive(),
}).strict();
export const documentQuery = paginationSchema.extend({
  search: z.string().trim().max(200).default(''),
  categoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(['draft', 'published', 'retired']).optional(),
});
export type DocumentMetadata = z.infer<typeof documentMetadata>;
export type DocumentQuery = z.infer<typeof documentQuery>;
export type Publication = z.infer<typeof publicationSchema>;
