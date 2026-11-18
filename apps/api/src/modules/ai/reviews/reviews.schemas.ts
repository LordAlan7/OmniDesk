import { z } from 'zod';

/**
 * Esquemas de validación de revisión y aplicación de recomendaciones (AIR-004).
 *
 * Reglas comunes:
 *  - `.strict()`: el cliente NO puede enviar campos de control (roles, scopes,
 *    parámetros del modelo). Todo lo decide el servidor (AIR-008).
 *  - `reason`: obligatorio y entre 5 y 2000 caracteres. No se acepta revisión
 *    "sin motivo" (criterio de aceptación: "La decisión identifica revisor,
 *    fecha y contenido concreto").
 *  - `decision`: 'approved' | 'rejected' | 'needs_more_info'. Para 'rejected'
 *    el backend exige además rol Manager (en la ruta, no en el esquema).
 *
 * Para 'apply':
 *  - `target`: 'investigation' (registra actividad en ticket_investigations
 *    vía FR-009) o 'resolution' (resuelve el ticket vía FR-009). No se permite
 *    cerrar: el cierre sigue siendo manual (FR-009 + criterio "Aceptar no
 *    ejecuta acciones ni declara resuelto el problema").
 *  - `ticketId`: obligatorio. La interacción ya lo conservó, pero el cliente
 *    lo reenvía para que el backend valide acceso con los permisos actuales
 *    (la asignación pudo haber cambiado entre la consulta y la aplicación).
 *  - `content`: depende del target. No se persiste nada que el cliente no
 *    haya confirmado explícitamente (FR-009 + AIR-006: validación humana
 *    de la información antes de guardarla como final).
 *  - `expectedVersion`: para `target='resolution'`, control de concurrencia
 *    del ticket (FR-009 ya lo exige al resolver).
 */
export const reviewSchema = z
  .object({
    decision: z.enum(['approved', 'rejected', 'needs_more_info']),
    reason: z
      .string()
      .trim()
      .min(5, 'El motivo debe tener al menos 5 caracteres.')
      .max(2000, 'El motivo no puede exceder 2000 caracteres.'),
  })
  .strict();

export const applyInvestigationSchema = z
  .object({
    target: z.literal('investigation'),
    ticketId: z.coerce.number().int().positive(),
    content: z
      .object({
        activity: z
          .string()
          .trim()
          .min(5, 'La actividad debe tener al menos 5 caracteres.')
          .max(5000, 'La actividad no puede exceder 5000 caracteres.'),
        result: z
          .string()
          .trim()
          .min(5, 'El resultado debe tener al menos 5 caracteres.')
          .max(5000, 'El resultado no puede exceder 5000 caracteres.'),
        knowledgeArticleId: z.coerce.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();

export const applyResolutionSchema = z
  .object({
    target: z.literal('resolution'),
    ticketId: z.coerce.number().int().positive(),
    expectedVersion: z.coerce.number().int().positive(),
    content: z
      .object({
        resolution: z
          .string()
          .trim()
          .min(5, 'La resolución debe tener al menos 5 caracteres.')
          .max(5000, 'La resolución no puede exceder 5000 caracteres.'),
        resolutionVerification: z
          .string()
          .trim()
          .min(5, 'La comprobación debe tener al menos 5 caracteres.')
          .max(5000, 'La comprobación no puede exceder 5000 caracteres.'),
        rootCause: z
          .string()
          .trim()
          .max(2000, 'La causa identificada no puede exceder 2000 caracteres.')
          .optional(),
        observations: z
          .string()
          .trim()
          .max(2000, 'Las observaciones no pueden exceder 2000 caracteres.')
          .optional(),
        knowledgeArticleId: z.coerce.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();

export const applySchema = z.discriminatedUnion('target', [
  applyInvestigationSchema,
  applyResolutionSchema,
]);