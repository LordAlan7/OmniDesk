
import { z } from 'zod';

const quotationItemSchema = z
  .object({
    concept: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    quantity: z.number().positive().max(999999999),
    unit: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export const createQuotationSchema = z
  .object({
    ticketId: z.number().int().positive(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    conditions: z.string().trim().max(5000).optional(),
    observations: z.string().trim().max(5000).optional(),
    items: z.array(quotationItemSchema).min(1).max(100),
  })
  .strict();

export const updateQuotationSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    conditions: z.string().trim().max(5000).nullable().optional(),
    observations: z.string().trim().max(5000).nullable().optional(),
    items: z.array(quotationItemSchema).min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedVersion'),
    { message: 'Debes proporcionar al menos un campo para actualizar.' },
  );

export const aiQuotationSuggestionSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(1).max(5000),
    conditions: z.string().trim().max(5000).nullable(),
    observations: z.string().trim().max(5000).nullable(),
    items: z
      .array(
        z
          .object({
            concept: z.string().trim().min(1).max(200),
            description: z.string().trim().max(2000).nullable(),
            quantity: z.number().positive().max(999999999),
            unit: z.string().trim().min(1).max(50).nullable(),
          })
          .strict(),
      )
      .max(100),
    missingInformation: z.array(z.string().trim().min(1).max(200)).max(30),
  })
  .strict();

  export const quotationReviewSchema = z
  .object({
    decision: z.enum([
      'approved',
      'rejected',
      'needs_more_info',
    ]),
    reason: z
      .string()
      .trim()
      .min(5, 'El motivo debe tener al menos 5 caracteres.')
      .max(2000, 'El motivo no puede exceder 2000 caracteres.'),
    expectedVersion: z.number().int().positive(),
  })
  .strict();