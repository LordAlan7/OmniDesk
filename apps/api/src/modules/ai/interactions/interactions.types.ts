import type { recordAuditInMemory } from '../../audit';
import type { AIProviderFailure } from '../providers/ai-provider';
import type { SourceReference } from '../sources/sources.types';

/**
 * Condición de la interacción (FR-013):
 * - recommendation: hay recomendación apoyada en fuentes autorizadas (siempre requiere revisión humana).
 * - needs_more_info: la consulta no permite orientar el diagnóstico; se piden más datos.
 * - insufficient_support: no hay respaldo documental suficiente; se recomienda revisión humana.
 * - failed: el proveedor falló o su respuesta no fue válida; NO hay recomendación.
 */
export type InteractionCondition = 'recommendation' | 'needs_more_info' | 'insufficient_support' | 'failed';

export interface AiInteraction {
  id: number;
  userId: number;
  ticketId: number | null;
  question: string;
  condition: InteractionCondition;
  answer: string | null;
  steps: string[];
  additionalInformation: string[];
  failureCode: AIProviderFailure | null;
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  references: SourceReference[];
  createdAt: string;
}

export type NewInteraction = Omit<AiInteraction, 'id' | 'createdAt'>;

/** Evento de auditoría que se confirma junto con la interacción (misma transacción en PostgreSQL). */
export type InteractionAudit = Parameters<typeof recordAuditInMemory>[0];

export interface InteractionsRepository {
  create(data: NewInteraction, audit: InteractionAudit): Promise<AiInteraction>;
  findById(id: number): Promise<AiInteraction | undefined>;
}
