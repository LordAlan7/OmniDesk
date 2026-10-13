/**
 * Contrato del proveedor de IA. El resto del sistema depende SOLO de esta interfaz,
 * así se puede cambiar OpenAI por otro servicio o modelo local sin rediseñar nada
 * (riesgo "Undefined AI architecture" del documento).
 */
export interface AIAnswer {
  text: string;
  /** Ids de artículos de la base de conocimiento usados como fuente. */
  sources: number[];
  /** Siempre true: toda respuesta debe identificarse como generada por IA (NFR-003). */
  aiGenerated: true;
}

export interface AIProvider {
  ask(question: string, context: { articleId: number; content: string }[]): Promise<AIAnswer>;
}
