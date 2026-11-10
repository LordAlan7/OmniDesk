import { env } from '../../config/env';
import { AppError, Errors } from '../../shared/errors';
import type { AuthUser } from '../../shared/types';
import { askWithAuthorizedSources } from './ai.service';
import { recordInteraction } from './interactions/interactions';
import type { InteractionCondition, NewInteraction } from './interactions/interactions.types';
import { createAIProvider } from './providers';
import { AIProviderError, type AIProvider } from './providers/ai-provider';
import type { SourceReference } from './sources/sources.types';

/** Resultado que ve el cliente. `aiGenerated` y `requiresHumanReview` son siempre true (NFR-003). */
export interface AssistantResult {
  interactionId: number;
  condition: Exclude<InteractionCondition, 'failed'>;
  aiGenerated: true;
  requiresHumanReview: true;
  message: string | null;
  recommendation: string | null;
  steps: string[];
  additionalInformation: string[];
  references: SourceReference[];
  ticketId: number | null;
}

export const AI_UNAVAILABLE_MESSAGE =
  'El asistente no está disponible en este momento. No se generó ninguna recomendación; puedes consultar la biblioteca y los tickets manualmente o intentarlo más tarde.';

const MAX_RECORDED_QUESTION = 2000;

/**
 * Orquesta una consulta al asistente (FR-013): valida, recupera con permisos, llama al proveedor,
 * estructura la respuesta y registra la interacción. NO modifica tickets ni aplica la recomendación.
 */
export async function runAssistantQuery(
  rawQuestion: string,
  user: AuthUser,
  options: { ticketId?: number } = {},
  provider?: AIProvider,
): Promise<AssistantResult> {
  // Se rechaza ANTES de cualquier llamada al proveedor.
  const question = rawQuestion.trim();
  if (question.length === 0) {
    throw Errors.validation([{ field: 'question', message: 'La pregunta no puede estar vacía.' }]);
  }
  if (question.length > env.aiMaxQuestionChars) {
    throw Errors.validation([
      { field: 'question', message: `La pregunta no puede superar ${env.aiMaxQuestionChars} caracteres.` },
    ]);
  }

  const startedAt = Date.now();
  const base = {
    userId: user.id,
    ticketId: options.ticketId ?? null,
    question: question.slice(0, MAX_RECORDED_QUESTION),
    provider: env.aiProvider,
    model: env.aiModel ?? null,
  };

  let outcome;
  try {
    let resolved = provider;
    if (!resolved) {
      try {
        resolved = createAIProvider();
      } catch {
        // Configuración incompleta (p. ej. sin clave): para el usuario es un servicio no disponible.
        throw new AIProviderError('unavailable', 'provider_not_configured');
      }
    }
    outcome = await askWithAuthorizedSources(question, user, resolved, options);
  } catch (cause) {
    if (!(cause instanceof AIProviderError)) throw cause; // 403/404/errores internos conservan su tipo
    await recordFailure(base, cause, Date.now() - startedAt);
    throw new AppError(503, 'AI_UNAVAILABLE', AI_UNAVAILABLE_MESSAGE);
  }

  const durationMs = Date.now() - startedAt;
  const condition: AssistantResult['condition'] =
    outcome.status === 'answered'
      ? 'recommendation'
      : outcome.status === 'needs_more_info'
        ? 'needs_more_info'
        : 'insufficient_support';

  const view =
    outcome.status === 'answered'
      ? { message: null, recommendation: outcome.recommendation, steps: outcome.steps, additionalInformation: outcome.additionalInformation }
      : outcome.status === 'needs_more_info'
        ? { message: outcome.message, recommendation: null, steps: [], additionalInformation: outcome.additionalInformation }
        : { message: outcome.message, recommendation: null, steps: [], additionalInformation: [] };

  const interaction = await recordInteraction(
    {
      ...base,
      condition,
      answer: view.recommendation ?? view.message,
      steps: view.steps,
      additionalInformation: view.additionalInformation,
      failureCode: null,
      durationMs,
      references: outcome.references,
    } satisfies NewInteraction,
    {
      action: 'ai.suggestion_generated',
      entity: 'ai_interaction',
      actorId: user.id,
      // Sin la pregunta ni la respuesta: solo lo necesario para trazar y evaluar (NFR-009 / NFR-002).
      metadata: { condition, ticketId: base.ticketId, referenceCount: outcome.references.length, model: base.model, durationMs },
    },
  );

  return {
    interactionId: interaction.id,
    condition,
    aiGenerated: true,
    requiresHumanReview: true,
    ...view,
    references: outcome.references,
    ticketId: base.ticketId,
  };
}

/** Registra el fallo (sin clave ni contexto); si el registro mismo falla, no oculta el error original. */
async function recordFailure(
  base: Pick<NewInteraction, 'userId' | 'ticketId' | 'question' | 'provider' | 'model'>,
  error: AIProviderError,
  durationMs: number,
): Promise<void> {
  try {
    await recordInteraction(
      {
        ...base,
        condition: 'failed',
        answer: null,
        steps: [],
        additionalInformation: [],
        failureCode: error.failure,
        durationMs,
        references: [],
      },
      {
        action: 'ai.request_failed',
        entity: 'ai_interaction',
        actorId: base.userId,
        metadata: { failure: error.failure, ticketId: base.ticketId, model: base.model, durationMs },
      },
    );
  } catch (cause) {
    console.error('[ai] no se pudo registrar el fallo del asistente', cause instanceof Error ? cause.name : 'error');
  }
}
