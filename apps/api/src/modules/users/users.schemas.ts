import { z } from 'zod';
import { ROLES } from '../../shared/types';

const roleSchema = z.enum(ROLES);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, 'Password must have at least 10 characters.').max(128),
  roles: z.array(roleSchema).min(1).default(['Employee']),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export const setRolesSchema = z.object({ roles: z.array(roleSchema).min(1) });
