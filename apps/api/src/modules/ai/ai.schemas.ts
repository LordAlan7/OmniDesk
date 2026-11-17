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

// Esquema de entrada para cuando el usuario pide sugerencias
export const ticketSuggestionRequestSchema = z.object({
  description: z.string().min(10, 'La descripción es muy corta').max(2000),
  // Opcional: si el usuario ya escribió algo, se lo pasamos a la IA
  currentTitle: z.string().optional(),
});

// Esquema de salida estricto (lo que la IA DEBE devolver)
export const aiTicketSuggestionSchema = z.object({
  title: z.string(),
  description: z.string(),
  categoryName: z.string().nullable().describe('Nombre de la categoría inferida, si es clara'),
  storeLocation: z.string().nullable(),
  motorcycleModel: z.string().nullable(),
  missingInformation: z.array(z.string()).describe('Campos que el usuario debe completar a mano'),
});