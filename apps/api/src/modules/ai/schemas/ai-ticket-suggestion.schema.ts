import { z } from 'zod';

/**
 * AIR-005 — esquemas de validación para el endpoint de sugerencia de campos
 * de ticket.
 *
 * Dos esquemas:
 *  - `aiTicketSuggestionRequestSchema`: valida lo que llega del frontend
 *    (descripción libre + título actual opcional).
 *  - `aiTicketSuggestionSchema`: valida la salida del proveedor antes de
 *    devolverla al frontend. Es la última línea de defensa: aunque un
 *    proveedor devuelva campos extra o tipos erróneos, el backend los
 *    rechaza con 502 (Bad Gateway) en lugar de propagarlos.
 *
 * `categoryName` admite null porque el proveedor puede no inferirlo; cuando
 * es string, debe estar en `ALLOWED_TICKET_CATEGORIES` (alineado con el
 * system prompt de `openai-provider.ts`).
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

export const aiTicketSuggestionRequestSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, 'La descripción debe tener al menos 10 caracteres.')
    .max(4000, 'La descripción no puede exceder 4000 caracteres.'),
  currentTitle: z
    .string()
    .trim()
    .max(120, 'El título actual no puede exceder 120 caracteres.')
    .optional(),
});

export const aiTicketSuggestionSchema = z.object({
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
    .union([
      z.enum(ALLOWED_TICKET_CATEGORIES),
      z.null(),
    ])
    .refine(
      (v) => v === null || ALLOWED_TICKET_CATEGORIES.includes(v as any),
      'Categoría no permitida.',
    ),
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
    .max(10, 'missingInformation no puede tener más de 10 elementos.'),
});

/**
 * Versión "raw" del esquema de salida: la usa el controller para validar lo
 * que devuelve el proveedor ANTES de normalizar (por ejemplo, recortar
 * espacios y longitudes). Si el proveedor envía campos adicionales, se
 * ignoran (`.passthrough()` implícito de Zod). Si faltan los obligatorios
 * o los tipos no coinciden, lanza y el controller lo traduce a 502.
 */
export const aiTicketSuggestionRawSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  categoryName: z.union([z.string(), z.null()]),
  storeLocation: z.union([z.string(), z.null()]),
  motorcycleModel: z.union([z.string(), z.null()]),
  missingInformation: z.array(z.string()),
}).passthrough();

export type AiTicketSuggestionRequest = z.infer<typeof aiTicketSuggestionRequestSchema>;
export type AiTicketSuggestion = z.infer<typeof aiTicketSuggestionSchema>;