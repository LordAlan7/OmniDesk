import { z } from 'zod';

/**
 * Esquemas de validación del módulo AI (AIR-001).
 *
 * Reglas comunes:
 *  - `.strict()` en el cuerpo: el cliente NO puede enviar roles, alcances, listas
 *    de fuentes ni ningún parámetro de control del modelo. Todo eso lo decide el
 *    servidor (AIR-008: el permiso se exige antes de recuperar; el proveedor se
 *    configura en el backend).
 *  - `question`: límites razonables para soporte. Mínimo 5 para evitar consultas
 *    vacías; máximo 2000 para acotar costo y evitar prompts abusivos.
 *  - `ticketId`: opcional. Sólo lo envía el frontend cuando el asistente se abre
 *    desde el detalle del ticket (decisión 4 del usuario). Si el usuario no tiene
 *    `ai:context:tickets`, el servicio lo rechaza con 403 (revalidado en backend).
 */
export const askSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(5, 'La pregunta debe tener al menos 5 caracteres.')
      .max(2000, 'La pregunta no puede exceder 2000 caracteres.'),
    ticketId: z.coerce.number().int().positive().optional(),
  })
  .strict();