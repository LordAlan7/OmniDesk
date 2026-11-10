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
  /** FR-013: estructura común. Todo es DATO generado: nunca se interpreta como instrucción ni como enlace. */
  recommendation?: string;
  steps?: string[];
  additionalInformation?: string[];
  /** El modelo indica que la consulta no permite orientar un diagnóstico y pide más datos. */
  needsMoreInfo?: boolean;
  /**
   * authorizationId de los fragmentos que el modelo dice haber usado. El servicio SOLO conserva los que
   * coinciden con fragmentos recuperados y autorizados; los demás (inventados) se descartan.
   */
  citations?: number[];
}

/** Fallo del proveedor. Nunca incluye la clave ni el contenido de la petición. */
export type AIProviderFailure = 'unavailable' | 'timeout' | 'invalid_response';

export class AIProviderError extends Error {
  constructor(
    public readonly failure: AIProviderFailure,
    message: string = failure,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/**
 * Fragmento de contexto enviado al modelo (AIR-002). Solo se construye con fuentes autorizadas y
 * conserva identidad y versión (AIR-007). `content` es DATO enmarcado, nunca instrucciones.
 */
export interface AIContextItem {
  /** Id de la fuente (compatibilidad: antes solo había artículos). */
  articleId: number;
  content: string;
  sourceType?: 'article' | 'document' | 'ticket';
  sourceId?: number;
  sourceVersion?: string;
  chunkIndex?: number;
  authorizationId?: number;
}

export interface AIProvider {
  ask(question: string, context: AIContextItem[]): Promise<AIAnswer>;
}
