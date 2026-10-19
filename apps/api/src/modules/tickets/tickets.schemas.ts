import { z } from 'zod';
import { paginationSchema } from '../../shared/http';
import {
  STRING_LIMITS,
  MESSAGES,
} from '../../shared/validation';
import { PRIORITIES, TICKET_STATUSES } from './tickets.types';

const priorityIds = Object.keys(PRIORITIES).map(Number);

export const createTicketSchema = z
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
      ),
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
      ),
    categoryId: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('categoryId')),
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
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: MESSAGES.noFieldsToUpdate,
  });

export const listTicketsSchema = paginationSchema.extend({
  status: z.enum(TICKET_STATUSES).optional(),
  priorityId: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().optional(),
});

export const prioritySchema = z
  .object({
    priorityId: z
      .number()
      .int()
      .refine((n) => priorityIds.includes(n), {
        message: MESSAGES.invalidEnum(
          'priorityId',
          priorityIds.map(String),
        ),
      }),
  })
  .strict();

export const assignmentSchema = z
  .object({
    technicianId: z
      .number()
      .int()
      .positive(MESSAGES.positiveInt('technicianId')),
    dueDate: z
      .string()
      .datetime(MESSAGES.invalidDate('dueDate'))
      .optional(),
  })
  .strict();

export const statusSchema = z
  .object({
    status: z.enum(TICKET_STATUSES, {
      message: MESSAGES.invalidEnum('status', TICKET_STATUSES),
    }),
  })
  .strict();

export const resolutionSchema = z
  .object({
    resolution: z
      .string()
      .trim()
      .min(
        STRING_LIMITS.ticketResolution.min,
        MESSAGES.tooShort('La resolución', STRING_LIMITS.ticketResolution.min),
      )
      .max(
        STRING_LIMITS.ticketResolution.max,
        MESSAGES.tooLong('La resolución', STRING_LIMITS.ticketResolution.max),
      ),
  })
  .strict();

export const closeSchema = z
  .object({
    comment: z
      .string()
      .trim()
      .max(
        STRING_LIMITS.ticketCloseComment.max,
        MESSAGES.tooLong('El comentario', STRING_LIMITS.ticketCloseComment.max),
      )
      .optional(),
  })
  .strict();