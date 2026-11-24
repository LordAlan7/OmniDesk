/**
 * Contrato del proveedor de IA. El resto del sistema depende SOLO de esta interfaz,
 * así se puede cambiar OpenAI por otro servicio o modelo local sin rediseñar nada
 * (riesgo "Undefined AI architecture" del documento).
 */
export interface AIAnswer {
  text: string;
  /** Ids de artículos de la base de conocimiento usados como fuente. */
  sources: number[];
  /** Fragmentos que el modelo declara haber utilizado. AIR-003. */
  citations?: {
    authorizationId: number;
    chunkIndex: number;
  }[];
  /** Siempre true: toda respuesta debe identificarse como generada por IA (NFR-003). */
  aiGenerated: true;
}

/**
 * Fragmento de contexto enviado al modelo (AIR-002). Solo se construye con fuentes autorizadas y
 * conserva identidad y versión (AIR-007). `content` es DATO enmarcado, nunca instrucciones.
 */
export interface AIContextItem {
  /** Id de la fuente (compatibilidad: antes solo había artículos). */
  articleId: number;
  content: string;
  sourceType?: 'article' | 'document' | 'ticket' | 'inventory';
  sourceId?: number;
  sourceVersion?: string;
  chunkIndex?: number;
  authorizationId?: number;
}

export interface QuotationContext {
  ticketId: number;
  title: string;
  description: string;
  status: string;
  categoryId: number;
  storeLocation: string | null;
  motorcycleModel: string | null;
}

export interface QuotationSuggestion {
  title: string;
  description: string;
  conditions: string | null;
  observations: string | null;
  items: {
    concept: string;
    description: string | null;
    quantity: number;
    unit: string | null;
  }[];
  missingInformation: string[];
}

export interface AIProvider {
  ask(question: string, context: AIContextItem[]): Promise<AIAnswer>;
  /**
   * AIR-005 — opcional: sugiere campos para un ticket a partir de la descripción
   * libre del usuario. El proveedor que no lo implemente hace que el endpoint
   * responda 501 (no soportado), pero la interfaz sigue válida para AIR-001.
   *
   * El contrato es ESTRICTO: el backend valida la salida con
   * `aiTicketSuggestionSchema` antes de devolverla al frontend, así que el
   * proveedor no puede añadir campos de control ni omitir los obligatorios.
   */
  suggestTicketFields?(description: string, currentTitle?: string): Promise<TicketFieldSuggestion>;

  suggestQuotation?(
    context: QuotationContext,
  ): Promise<QuotationSuggestion>;
}

/**
 * AIR-005 — propuesta de campos para un ticket. Todos los campos son
 * sugerencias: el usuario los revisa y confirma antes de crear/actualizar.
 *
 * - `title` y `description` son siempre no vacíos (los rellena la IA).
 * - `categoryName`, `storeLocation`, `motorcycleModel` son null cuando la IA
 *   no pudo inferirlos con confianza: el usuario los completa a mano.
 * - `missingInformation` lista los campos que el usuario debería revisar
 *   antes de confirmar (guía para la UI, no un campo del ticket).
 */
export interface TicketFieldSuggestion {
  title: string;
  description: string;
  categoryName: string | null;
  storeLocation: string | null;
  motorcycleModel: string | null;
  missingInformation: string[];
}