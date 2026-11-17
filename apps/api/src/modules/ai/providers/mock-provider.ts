import { Errors } from '../../../shared/errors';
import type {
  AIAnswer,
  AIContextItem,
  AIProvider,
  TicketFieldSuggestion,
} from './ai-provider';

/**
 * Proveedor mock para desarrollo y tests (AIR-001 / AIR-005).
 *
 * No llama a ningún servicio externo: responde con un texto fijo y un
 * conjunto de fragmentos derivados del contexto. Sirve para ejercitar
 * el flujo completo (route → controller → provider → framing →
 * validación → auditoría) sin necesidad de claves ni red.
 *
 * En AIR-005 también implementa `suggestTicketFields` con heurísticas
 * simples y deterministas: el equipo de QA puede escribir tests exactos
 * contra estas reglas sin depender de un modelo no determinista.
 */
export class MockProvider implements AIProvider {
  async ask(question: string, context: AIContextItem[]): Promise<AIAnswer> {
    if (context.length === 0) {
      return {
        text: 'No se encontraron fragmentos autorizados para esta consulta.',
        sources: [],
        citations: [],
        aiGenerated: true,
      };
    }

    const first = context[0];
    const text =
      `Respuesta simulada basada en ${context.length} fragmento(s) autorizado(s). ` +
      `La consulta "${question.slice(0, 60)}" se asocia principalmente al fragmento #${first.chunkIndex ?? 0}.`;

    return {
      text,
      sources: context.map((c) => c.articleId),
      citations: context.map((c) => ({
        authorizationId: c.authorizationId ?? 0,
        chunkIndex: c.chunkIndex ?? 0,
      })),
      aiGenerated: true,
    };
  }

  /**
   * AIR-005 — sugerencia determinista de campos de ticket.
   * Las heurísticas son intencionalmente simples: el objetivo es que la
   * pipeline de validación y auditoría se pueda probar sin un proveedor
   * real. El proveedor OpenAI implementará la inferencia con el modelo.
   */
  async suggestTicketFields(
    description: string,
    currentTitle?: string,
  ): Promise<TicketFieldSuggestion> {
    if (!description || !description.trim()) {
      throw Errors.validation(
        [],
        'Se requiere una descripción para sugerir campos del ticket.',
      );
    }

    const lower = description.toLowerCase();
    const missing: string[] = [];

    // Categoría: dos patrones comunes en soporte técnico de motos.
    let categoryName: string | null = null;
    if (lower.includes('motor') || lower.includes('aceite') || lower.includes('fuga')) {
      categoryName = 'Motor';
    } else if (lower.includes('freno') || lower.includes('pastilla') || lower.includes('líquido')) {
      categoryName = 'Frenos';
    } else if (lower.includes('batería') || lower.includes('arranque') || lower.includes('eléctrico')) {
      categoryName = 'Sistema Eléctrico';
    } else {
      missing.push('categoría');
    }

    // Ubicación de tienda: aparecen referencias a sucursal?
    const storeLocation: string | null =
      lower.match(/sucursal\s+([a-záéíóú]+)/)?.[1]
        ? `${lower.match(/sucursal\s+([a-záéíóú]+)/)![1][0].toUpperCase()}${lower.match(/sucursal\s+([a-záéíóú]+)/)![1].slice(1)}`
        : null;
    if (!storeLocation) missing.push('ubicación de la sucursal');

    // Modelo de motocicleta: patrón "modelo X" o marca + modelo.
    const modelMatch = lower.match(/modelo\s+([a-z0-9\-]+)/);
    const motorcycleModel: string | null = modelMatch ? modelMatch[1].toUpperCase() : null;
    if (!motorcycleModel) missing.push('modelo de motocicleta');

    // Título: usa el actual si viene, si no lo deriva.
    const title = (currentTitle?.trim() || deriveTitle(description)).slice(0, 120);

    return {
      title,
      description: description.trim().slice(0, 2000),
      categoryName,
      storeLocation,
      motorcycleModel,
      missingInformation: missing,
    };
  }
}

function deriveTitle(description: string): string {
  const words = description.trim().split(/\s+/).slice(0, 8).join(' ');
  return words.length < description.length ? `${words}…` : words;
}