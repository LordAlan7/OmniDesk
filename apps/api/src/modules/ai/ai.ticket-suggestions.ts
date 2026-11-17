import { createAIProvider } from './providers';
import { aiTicketSuggestionSchema } from './ai.schemas';
import { Errors } from '../../shared/errors';

export async function generateTicketSuggestion(description: string) {
  const provider = createAIProvider();

  // Si el proveedor tiene la función de sugerencias (Mock u OpenAI)
  if ('suggestTicketFields' in provider) {
    const rawSuggestion = await (provider as any).suggestTicketFields(description);
    
    // Validamos que la respuesta cumpla con el contrato estricto
    const parsed = aiTicketSuggestionSchema.safeParse(rawSuggestion);
    if (!parsed.success) {
      throw Errors.invalidState('La IA generó una respuesta inválida. Intenta de nuevo o crea el ticket manualmente.');
    }
    return parsed.data;
  }

  throw Errors.invalidState('El proveedor de IA no soporta sugerencias de tickets.');
}