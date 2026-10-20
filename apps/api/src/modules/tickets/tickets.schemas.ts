import { z } from 'zod';
import { paginationSchema } from '../../shared/http';
import { PRIORITIES, TICKET_STATUSES } from './tickets.types';

const priorityIds = Object.keys(PRIORITIES).map(Number);

export const createTicketSchema = z.object({
  title: z.string().trim().min(3, 'The title is required (min 3 characters).').max(200),
  description: z.string().trim().min(1, 'The description is required.').max(5000),
  categoryId: z.number().int().positive(),
});

export const updateTicketSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    categoryId: z.number().int().positive().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export const listTicketsSchema = paginationSchema.extend({
  status: z.enum(TICKET_STATUSES).optional(),
  priorityId: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().optional(),
});

export const prioritySchema = z.object({
  priorityId: z.number().int().refine((n) => priorityIds.includes(n), {
    message: `priorityId must be one of: ${priorityIds.join(', ')}`,
  }),
});

export const assignmentSchema = z.object({
  technicianId: z.number().int().positive(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000).optional(),
  dueDate: z.string().datetime().optional(),
});

export const statusSchema = z.object({ status: z.enum(TICKET_STATUSES) });
export const resolutionSchema = z.object({ resolution: z.string().trim().min(5).max(5000) });
export const closeSchema = z.object({ comment: z.string().trim().max(1000).optional() });
