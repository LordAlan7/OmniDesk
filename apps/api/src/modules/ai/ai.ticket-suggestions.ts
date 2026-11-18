import { createAIProvider } from './providers';
import { aiTicketSuggestionSchema } from './ai.schemas';
import type { AiTicketSuggestion, AiTicketSuggestionConfirm } from './ai.schemas';
import { Errors } from '../../shared/errors';

/**
 * AIR-005 — sugerencias de campos para tickets.
 *
 * Flujo de cuatro pasos:
 *  1. `generateTicketSuggestion`: el usuario envía la descripción, el proveedor
 *     propone campos, el backend valida con `aiTicketSuggestionSchema` y
 *     persiste la sugerencia en memoria con un `suggestionId`. Devuelve la
 *     sugerencia + el `suggestionId` para que el frontend la edite.
 *  2. `confirmSuggestion`: el usuario revisa, edita y confirma. El backend
 *     valida que la sugerencia exista, pertenezca al usuario y NO esté ya
 *     confirmada. Persiste los campos confirmados y marca `confirmedAt`.
 *  3. `discardSuggestion`: el usuario descarta la sugerencia. El backend
 *     valida propiedad y la elimina del almacén. No se puede descartar ni
 *     confirmar una sugerencia ya descartada (no existe).
 *  4. `getConfirmedSuggestion`: lo usa el endpoint de "aplicar" para
 *     materializar la sugerencia en un ticket, con la prueba de que el
 *     usuario la revisó.
 *
 * El almacén es en memoria (mismo patrón que `interactions/interactions.ts`):
 * suficiente para el alcance de AIR-005 y para los tests. Cuando el ticket
 * se crea/aplica, el endpoint puede llamar a `removeSuggestion` para
 * liberar la entrada; si no, expira por inactividad (no implementado aún,
 * marcado como pendiente para AIR-005 v2).
 *
 * Seguridad:
 *  - Cada sugerencia se asocia al `userId` que la pidió. `getSuggestionForUser`,
 *    `confirmSuggestion`, `discardSuggestion` y `getConfirmedSuggestion`
 *    validan propiedad: un usuario no puede confirmar, descartar ni leer
 *    la sugerencia de otro.
 *  - No se confirma dos veces: una vez `confirmedAt` está seteado, se
 *    rechaza con 409 (Conflict).
 *  - No se descarta una sugerencia confirmada: si el usuario ya confirmó,
 *    debe usar `apply` o simplemente ignorarla. `discardSuggestion` rechaza
 *    con 409 si la sugerencia está confirmada.
 *  - La salida del proveedor se valida SIEMPRE con `aiTicketSuggestionSchema`
 *    antes de persistir: aunque el proveedor añada campos o se pase de
 *    longitud, no se almacena nada no validado.
 */

interface StoredSuggestion {
  id: number;
  userId: number;
  createdAt: Date;
  confirmedAt: Date | null;
  original: AiTicketSuggestion;
  confirmed: AiTicketSuggestionConfirm | null;
}

const suggestions = new Map<number, StoredSuggestion>();
let nextSuggestionId = 1;

export interface TicketSuggestionResponse {
  suggestionId: number;
  suggestion: AiTicketSuggestion;
  createdAt: Date;
  confirmed: boolean;
}

/**
 * Paso 1 — el usuario pide una sugerencia a partir de la descripción.
 *
 * Llama al proveedor, valida la salida con `aiTicketSuggestionSchema`
 * (última línea de defensa ante el proveedor) y la persiste en memoria
 * asociada al `userId`. Devuelve la sugerencia + `suggestionId` para que
 * el frontend la edite y luego confirme.
 */
export async function generateTicketSuggestion(
  description: string,
  userId: number,
  currentTitle?: string,
): Promise<TicketSuggestionResponse> {
  const provider = createAIProvider();

  // Si el proveedor tiene la función de sugerencias (Mock u OpenAI)
  if (!('suggestTicketFields' in provider) || !provider.suggestTicketFields) {
    throw Errors.invalidState(
      'El proveedor de IA no soporta sugerencias de tickets.',
    );
  }

  const rawSuggestion = await provider.suggestTicketFields(description, currentTitle);

  // Validamos que la respuesta cumpla con el contrato estricto.
  // Si el proveedor añade campos o se pasa de longitud, se rechaza con 502
  // (Bad Gateway) en lugar de propagar la salida no confiable.
  const parsed = aiTicketSuggestionSchema.safeParse(rawSuggestion);
  if (!parsed.success) {
    throw Errors.badGateway(
      'La IA generó una respuesta inválida. Intenta de nuevo o crea el ticket manualmente.',
    );
  }

  const id = nextSuggestionId++;
  const stored: StoredSuggestion = {
    id,
    userId,
    createdAt: new Date(),
    confirmedAt: null,
    original: parsed.data,
    confirmed: null,
  };
  suggestions.set(id, stored);

  return {
    suggestionId: id,
    suggestion: parsed.data,
    createdAt: stored.createdAt,
    confirmed: false,
  };
}

/**
 * Recupera una sugerencia por id, validando que pertenezca al usuario.
 * Lanza 404 si no existe o 403 si no es del usuario (anti-sustitución).
 */
export function getSuggestionForUser(
  suggestionId: number,
  userId: number,
): StoredSuggestion {
  const stored = suggestions.get(suggestionId);
  if (!stored) {
    throw Errors.notFound('TicketSuggestion');
  }
  if (stored.userId !== userId) {
    throw Errors.forbidden(
      'No tienes acceso a esta sugerencia de ticket.',
    );
  }
  return stored;
}

/**
 * Paso 2 — el usuario confirma la sugerencia (posiblemente editada).
 *
 * El frontend envía `suggestionId` más los campos finales. El backend:
 *  1. Recupera la sugerencia y valida propiedad.
 *  2. Verifica que NO esté ya confirmada (409 si lo está).
 *  3. Persiste los campos confirmados y marca `confirmedAt`.
 *
 * El `suggestionId` es la prueba de que el usuario revisó la sugerencia
 * antes de crear/actualizar el ticket (criterio de aceptación de AIR-005).
 */
export function confirmSuggestion(
  suggestionId: number,
  userId: number,
  confirmedFields: AiTicketSuggestionConfirm,
): TicketSuggestionResponse {
  const stored = getSuggestionForUser(suggestionId, userId);

  if (stored.confirmedAt !== null) {
    throw Errors.invalidState(
      'Esta sugerencia ya fue confirmada. No se puede confirmar dos veces.',
    );
  }

  // `confirmedFields` ya viene validado por `aiTicketSuggestionConfirmSchema`
  // en el route handler; aquí solo se persiste.
  stored.confirmed = confirmedFields;
  stored.confirmedAt = new Date();

  return {
    suggestionId: stored.id,
    suggestion: stored.original,
    createdAt: stored.createdAt,
    confirmed: true,
  };
}

/**
 * Paso 3 — el usuario descarta la sugerencia sin aplicarla.
 *
 * El backend valida propiedad y que NO esté ya confirmada (409 si lo está:
 * una sugerencia confirmada debe ir a `apply` o quedarse, no descartarse).
 * Elimina la entrada del almacén. Si la sugerencia no existe (ya descartada
 * o nunca creada), se ignora silenciosamente (idempotente desde el punto de
 * vista del cliente: el resultado final es "la sugerencia no está").
 *
 * El criterio de aceptación de AIR-005 pide "permitir editar, completar o
 * descartar": descartar cierra el flujo sin crear ticket y deja la creación
 * manual disponible (criterio: "La creación manual permanece disponible
 * ante fallos").
 */
export function discardSuggestion(
  suggestionId: number,
  userId: number,
): { suggestionId: number; discarded: true } {
  const stored = suggestions.get(suggestionId);
  if (!stored) {
    // Idempotente: si no existe, se reporta como descartada.
    return { suggestionId, discarded: true };
  }
  if (stored.userId !== userId) {
    throw Errors.forbidden(
      'No tienes acceso a esta sugerencia de ticket.',
    );
  }
  if (stored.confirmedAt !== null) {
    throw Errors.invalidState(
      'Esta sugerencia ya fue confirmada. No se puede descartar después de confirmar. Aplícala o ignórala.',
    );
  }
  suggestions.delete(suggestionId);
  return { suggestionId, discarded: true };
}

/**
 * Paso 4 — el endpoint de "aplicar" recupera la sugerencia confirmada.
 *
 * Lanza 404 si no existe, 403 si no es del usuario, y 409 si aún no ha
 * sido confirmada. El endpoint que materializa la sugerencia en un
 * ticket (crear/actualizar) usa este método para asegurar que el usuario
 * pasó por el paso de revisión.
 */
export function getConfirmedSuggestion(
  suggestionId: number,
  userId: number,
): { original: AiTicketSuggestion; confirmed: AiTicketSuggestionConfirm } {
  const stored = getSuggestionForUser(suggestionId, userId);

  if (stored.confirmedAt === null || stored.confirmed === null) {
    throw Errors.invalidState(
      'Esta sugerencia aún no ha sido confirmada por el usuario.',
    );
  }

  return {
    original: stored.original,
    confirmed: stored.confirmed,
  };
}

/**
 * Elimina la sugerencia del almacén. Lo llama el endpoint de "aplicar"
 * después de materializar la sugerencia en un ticket, para liberar la
 * entrada y evitar que se aplique dos veces. A diferencia de
 * `discardSuggestion`, no valida `confirmedAt` (la sugerencia ya se aplicó).
 */
export function removeSuggestion(suggestionId: number, userId: number): void {
  const stored = suggestions.get(suggestionId);
  if (!stored) {
    return;
  }
  if (stored.userId !== userId) {
    throw Errors.forbidden(
      'No tienes acceso a esta sugerencia de ticket.',
    );
  }
  suggestions.delete(suggestionId);
}

/**
 * Sólo para tests: reinicia el almacén y el contador. Jamás se llama
 * desde el código de producción.
 */
export function __resetTicketSuggestionsForTests(): void {
  suggestions.clear();
  nextSuggestionId = 1;
}