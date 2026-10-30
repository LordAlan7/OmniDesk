
import { z } from 'zod';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'La fecha no es válida.');

export const reportTicketFiltersSchema = z
  .object({
    status: z.enum([
      'Open',
      'Assigned',
      'In Progress',
      'Resolved',
      'Closed',
    ]).optional(),

    priorityId: z.coerce.number().int().positive().optional(),

    technicianId: z.coerce.number().int().positive().optional(),

    from: dateSchema.optional(),

    to: dateSchema.optional(),

    limit: z.coerce.number().int().min(1).max(100).default(20),

    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()
  .refine(
    (filters) =>
      !filters.from ||
      !filters.to ||
      filters.from <= filters.to,
    {
      message: 'La fecha final debe ser igual o posterior a la inicial.',
      path: ['to'],
    },
  );

/**
 * FR-016: validación del periodo de actividad.
 */
export const reportActivityFiltersSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .strict()
  .refine(
    (filters) =>
      !filters.from ||
      !filters.to ||
      filters.from <= filters.to,
    {
      message:
        'La fecha final debe ser igual o posterior a la inicial.',
      path: ['to'],
    },
  );
