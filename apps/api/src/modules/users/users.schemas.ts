import { z } from 'zod';
import {
  STRING_LIMITS,
  MESSAGES,
} from '../../shared/validation';
import { ROLES } from '../../shared/types';

const roleSchema = z.enum(ROLES);

const rolesSchema = z
  .array(roleSchema)
  .min(1, MESSAGES.atLeastOneRole)
  .refine(
    (roles) => new Set(roles).size === roles.length,
    { message: MESSAGES.duplicateRoles },
  );

export const createUserSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(
        STRING_LIMITS.userName.min,
        MESSAGES.tooShort('El nombre', STRING_LIMITS.userName.min),
      )
      .max(
        STRING_LIMITS.userName.max,
        MESSAGES.tooLong('El nombre', STRING_LIMITS.userName.max),
      ),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(
        STRING_LIMITS.userEmail.min,
        MESSAGES.tooShort('El correo', STRING_LIMITS.userEmail.min),
      )
      .max(
        STRING_LIMITS.userEmail.max,
        MESSAGES.tooLong('El correo', STRING_LIMITS.userEmail.max),
      )
      .email(MESSAGES.invalidEmail),
    password: z
      .string()
      .min(
        STRING_LIMITS.userPassword.min,
        MESSAGES.tooShort('La contraseña', STRING_LIMITS.userPassword.min),
      )
      .max(
        STRING_LIMITS.userPassword.max,
        MESSAGES.tooLong('La contraseña', STRING_LIMITS.userPassword.max),
      ),
    roles: rolesSchema.default(['Employee']),
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(
        STRING_LIMITS.userName.min,
        MESSAGES.tooShort('El nombre', STRING_LIMITS.userName.min),
      )
      .max(
        STRING_LIMITS.userName.max,
        MESSAGES.tooLong('El nombre', STRING_LIMITS.userName.max),
      )
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(
        STRING_LIMITS.userEmail.min,
        MESSAGES.tooShort('El correo', STRING_LIMITS.userEmail.min),
      )
      .max(
        STRING_LIMITS.userEmail.max,
        MESSAGES.tooLong('El correo', STRING_LIMITS.userEmail.max),
      )
      .email(MESSAGES.invalidEmail)
      .optional(),
    roles: rolesSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    { message: MESSAGES.noFieldsToUpdate },
  );

export const setRolesSchema = z
  .object({
    roles: rolesSchema,
  })
  .strict();