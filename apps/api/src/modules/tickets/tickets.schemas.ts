import { z } from 'zod';
import { paginationSchema } from '../../shared/http';
import { STRING_LIMITS, MESSAGES } from '../../shared/validation';
import { PRIORITIES, TICKET_STATUSES } from './tickets.types';

const priorityIds = Object.keys(PRIORITIES).map(Number);

// ──────────────────────────────────────────────────────────────────────────────
// NUEVOS LÍMITES PARA FR-010
// ──────────────────────────────────────────────────────────────────────────────
const businessLocationLimits = { min: 1, max: 200 };
const motorcycleModelLimits = { min: 1, max: 200 };

export const createTicketSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(STRING_LIMITS.ticketTitle.min, MESSAGES.tooShort('El título', STRING_LIMITS.ticketTitle.min))
      .max(STRING_LIMITS.ticketTitle.max, MESSAGES.tooLong('El título', STRING_LIMITS.ticketTitle.max)),
    description: z
      .string()
      .trim()
      .min(STRING_LIMITS.ticketDescription.min, MESSAGES.required('La descripción'))
      .max(STRING_LIMITS.ticketDescription.max, MESSAGES.tooLong('La descripción', STRING_LIMITS.ticketDescription.max)),
    categoryId: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('categoryId')),

    // NUEVOS CAMPOS FR-010:
    storeLocation: z
      .string()
      .trim()
      .min(businessLocationLimits.min, MESSAGES.required('La tienda o ubicación'))
      .max(businessLocationLimits.max, MESSAGES.tooLong('La tienda', businessLocationLimits.max)),
    motorcycleModel: z
      .string()
      .trim()
      .min(motorcycleModelLimits.min, MESSAGES.required('El modelo de motocicleta'))
      .max(motorcycleModelLimits.max, MESSAGES.tooLong('El modelo de motocicleta', motorcycleModelLimits.max)),
  })
  .strict();

export const updateTicketSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(
        STRING_LIMITS.ticketTitle.min,
        MESSAGES.tooShort('El título', STRING_LIMITS.ticketTitle.min),
      )
      .max(
        STRING_LIMITS.ticketTitle.max,
        MESSAGES.tooLong('El título', STRING_LIMITS.ticketTitle.max),
      )
      .optional(),
    description: z
      .string()
      .trim()
      .min(
        STRING_LIMITS.ticketDescription.min,
        MESSAGES.required('La descripción'),
      )
      .max(
        STRING_LIMITS.ticketDescription.max,
        MESSAGES.tooLong('La descripción', STRING_LIMITS.ticketDescription.max),
      )
      .optional(),
    categoryId: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('categoryId'))
      .optional(),
    version: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('version')),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, {
    message: MESSAGES.noFieldsToUpdate,
  });

// NUEVO SCHEMA PARA FR-010:
export const businessInfoUpdateSchema = z
  .object({
    storeLocation: z
      .string()
      .trim()
      .min(businessLocationLimits.min, MESSAGES.required('La tienda o ubicación'))
      .max(businessLocationLimits.max, MESSAGES.tooLong('La tienda', businessLocationLimits.max))
      .optional(),
    motorcycleModel: z
      .string()
      .trim()
      .min(motorcycleModelLimits.min, MESSAGES.required('El modelo de motocicleta'))
      .max(motorcycleModelLimits.max, MESSAGES.tooLong('El modelo de motocicleta', motorcycleModelLimits.max))
      .optional(),
    version: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('version')),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, {
    message: MESSAGES.noFieldsToUpdate,
  });

export const listTicketsSchema = paginationSchema.extend({
  status: z.enum(TICKET_STATUSES).optional(),
  priorityId: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().optional(),
  overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const prioritySchema = z
  .object({
    priorityId: z
      .number()
      .int()
      .refine((n: number) => priorityIds.includes(n), {
        message: MESSAGES.invalidEnum('priorityId', priorityIds.map(String)),
      }),
    expectedVersion: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('expectedVersion')),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const assignmentSchema = z
  .object({
    technicianId: z.number().int().positive(MESSAGES.positiveInt('technicianId')),
    dueDate: z.string().datetime(MESSAGES.invalidDate('dueDate')).optional(),
    expectedVersion: z.number().int().positive(MESSAGES.positiveInt('expectedVersion')),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const statusSchema = z
  .object({
    status: z.enum(TICKET_STATUSES, { message: MESSAGES.invalidEnum('status', TICKET_STATUSES) }),
    expectedVersion: z.number().int().positive(MESSAGES.positiveInt('expectedVersion')).optional(),
  })
  .strict();

export const resolutionSchema = z
  .object({
    // Solución aplicada (FR-009): descripción de lo que se hizo.
    resolution: z
      .string()
      .trim()
      .min(STRING_LIMITS.ticketResolution.min, MESSAGES.tooShort('La resolución', STRING_LIMITS.ticketResolution.min))
      .max(STRING_LIMITS.ticketResolution.max, MESSAGES.tooLong('La resolución', STRING_LIMITS.ticketResolution.max)),
    // FR-009: comprobación del resultado. Texto libre, obligatorio.
    resolutionVerification: z
      .string()
      .trim()
      .min(5, 'La comprobación del resultado es obligatoria (mínimo 5 caracteres).')
      .max(5000, 'La comprobación del resultado no puede exceder 5000 caracteres.'),
    // FR-009: causa identificada. Opcional — no se obliga al técnico a inventarla.
    rootCause: z
      .string()
      .trim()
      .max(2000, 'La causa identificada no puede exceder 2000 caracteres.')
      .optional(),
    // FR-009: observaciones complementarias. Opcionales.
    observations: z
      .string()
      .trim()
      .max(2000, 'Las observaciones no pueden exceder 2000 caracteres.')
      .optional(),
    // FR-009: referencia opcional a artículo de conocimiento aprobado (FR-011).
    knowledgeArticleId: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('knowledgeArticleId'))
      .optional(),
  })
  .strict();

export const closeSchema = z
  .object({
    comment: z.string().trim().max(STRING_LIMITS.ticketCloseComment.max).optional(),
  })
  .strict();

export const categoryUpdateSchema = z
  .object({
    categoryId: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('categoryId')),
  })
  .strict();

/** FR-008: el plazo se modifica con motivo obligatorio; null lo elimina. */
export const deadlineSchema = z
  .object({
    dueDate: z.string().datetime(MESSAGES.invalidDate('dueDate')).nullable(),
    expectedVersion: z.number().int().positive(MESSAGES.positiveInt('expectedVersion')),
    reason: z.string().trim().min(1, MESSAGES.required('El motivo')).max(500),
  })
  .strict();

export const progressUpdateSchema = z
  .object({
    note: z.string().trim().min(1, MESSAGES.required('La nota de avance')).max(1000),
  })
  .strict();


  /** FR-009: registro de una actividad de investigación. */
export const investigationSchema = z
  .object({
    activity: z
      .string()
      .trim()
      .min(1, MESSAGES.required('La actividad o prueba realizada'))
      .max(5000, 'La actividad no puede exceder 5000 caracteres.'),
    result: z
      .string()
      .trim()
      .min(1, MESSAGES.required('El resultado observado'))
      .max(5000, 'El resultado no puede exceder 5000 caracteres.'),
    knowledgeArticleId: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('knowledgeArticleId'))
      .optional(),
  })
  .strict();

/** FR-009: reapertura de un ticket resuelto. El motivo es obligatorio. */
export const reopenSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, MESSAGES.required('El motivo de reapertura'))
      .max(500, 'El motivo de reapertura no puede exceder 500 caracteres.'),
    expectedVersion: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('expectedVersion')),
  })
  .strict();
