import { z } from 'zod';

/**
 * Esquemas de validación del módulo AI (AIR-001 / AIR-005).
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
 *
 * AIR-005 (sugerencia de campos de ticket):
 *  - `ticketSuggestionRequestSchema`: lo que envía el frontend al pedir la
 *    sugerencia (descripción + título actual opcional).
 *  - `aiTicketSuggestionSchema`: lo que la IA DEBE devolver. Estricto: si el
 *    proveedor añade campos o se pasa de longitud, el backend lo rechaza
 *    con 502 (Bad Gateway). Es la última línea de defensa ante el proveedor.
 *  - `aiTicketSuggestionConfirmSchema`: lo que el usuario confirma tras editar
 *    la sugerencia. `.strict()`: el cliente no puede inyectar campos de
 *    control. El `suggestionId` debe existir y pertenecer al usuario; el
 *    backend lo valida contra el almacén (paso 5).
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

/**
 * AIR-005 — categorías permitidas en una sugerencia. Alineadas con el
 * system prompt de `openai-provider.ts` y con las heurísticas del mock.
 * El proveedor puede devolver `null` (no pudo inferir); pero si devuelve
 * string, debe estar en esta lista, si no el backend lo rechaza.
 */
export const ALLOWED_TICKET_CATEGORIES = [
  'Motor',
  'Frenos',
  'Sistema Eléctrico',
  'Suspensión',
  'Transmisión',
  'Lubricación',
  'Enfriamiento',
  'Carrocería',
  'Accesorios',
  'Otro',
] as const;

// Esquema de entrada: el usuario pide una sugerencia a partir de la descripción.
export const ticketSuggestionRequestSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(10, 'La descripción es muy corta (mínimo 10 caracteres).')
      .max(2000, 'La descripción no puede exceder 2000 caracteres.'),
    currentTitle: z
      .string()
      .trim()
      .max(120, 'El título actual no puede exceder 120 caracteres.')
      .optional(),
  })
  .strict();

// Esquema de salida estricto (lo que la IA DEBE devolver).
// Es la última línea de defensa: aunque el proveedor añada campos extra o se
// pase de longitud, el backend lo rechaza con 502 (Bad Gateway) en lugar de
// propagarlos al frontend. AIR-008: el cliente no controla la estructura.
export const aiTicketSuggestionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'El título sugerido debe tener al menos 3 caracteres.')
      .max(120, 'El título sugerido no puede exceder 120 caracteres.'),
    description: z
      .string()
      .trim()
      .min(10, 'La descripción sugerida debe tener al menos 10 caracteres.')
      .max(2000, 'La descripción sugerida no puede exceder 2000 caracteres.'),
    categoryName: z
      .union([z.enum(ALLOWED_TICKET_CATEGORIES), z.null()])
      .describe('Nombre de la categoría inferida, si es clara'),
    storeLocation: z
      .string()
      .trim()
      .max(120, 'La ubicación no puede exceder 120 caracteres.')
      .nullable(),
    motorcycleModel: z
      .string()
      .trim()
      .max(80, 'El modelo no puede exceder 80 caracteres.')
      .nullable(),
    missingInformation: z
      .array(z.string().trim().min(1).max(80))
      .max(10, 'missingInformation no puede tener más de 10 elementos.')
      .describe('Campos que el usuario debe completar a mano'),
  })
  .strict();

/**
 * AIR-005 — esquema de la confirmación del usuario.
 *
 * El frontend envía `suggestionId` (lo devolvió `POST /ai/ticket-suggestions`)
 * más los campos finales, ya editados. El backend valida que:
 *  - el `suggestionId` exista y pertenezca al usuario (anti-sustitución);
 *  - no esté ya confirmado (no se confirma dos veces);
 *  - los campos respeten las mismas reglas que la creación de ticket
 *    (longitudes, categoría válida si viene string).
 *
 * El `suggestionId` es la prueba de que el usuario revisó la sugerencia
 * antes de crear/actualizar el ticket (criterio de aceptación de AIR-005).
 */
export const aiTicketSuggestionConfirmSchema = z
  .object({
    suggestionId: z.coerce.number().int().positive(),
    title: z
      .string()
      .trim()
      .min(3, 'El título debe tener al menos 3 caracteres.')
      .max(120, 'El título no puede exceder 120 caracteres.'),
    description: z
      .string()
      .trim()
      .min(10, 'La descripción debe tener al menos 10 caracteres.')
      .max(2000, 'La descripción no puede exceder 2000 caracteres.'),
    categoryId: z.coerce.number().int().positive().nullable(),
    storeLocation: z
      .string()
      .trim()
      .max(120, 'La ubicación no puede exceder 120 caracteres.')
      .nullable(),
    motorcycleModel: z
      .string()
      .trim()
      .max(80, 'El modelo no puede exceder 80 caracteres.')
      .nullable(),
  })
  .strict();

export type AiTicketSuggestionRequest = z.infer<typeof ticketSuggestionRequestSchema>;
export type AiTicketSuggestion = z.infer<typeof aiTicketSuggestionSchema>;
export type AiTicketSuggestionConfirm = z.infer<typeof aiTicketSuggestionConfirmSchema>;