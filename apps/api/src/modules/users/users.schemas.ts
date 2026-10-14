import { z } from 'zod';
import { ROLES } from '../../shared/types';

const roleSchema = z.enum(ROLES);

const rolesSchema = z
  .array(roleSchema)
  .min(1, 'Selecciona al menos un rol.')
  .refine(
    (roles) => new Set(roles).size === roles.length,
    { message: 'No se permiten roles duplicados.' },
  );

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    password: z
      .string()
      .min(10, 'La contraseña debe tener al menos 10 caracteres.')
      .max(128),
    roles: rolesSchema.default(['Employee']),
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    roles: rolesSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    { message: 'Debes enviar al menos un campo para actualizar.' },
  );

export const setRolesSchema = z
  .object({
    roles: rolesSchema,
  })
  .strict();