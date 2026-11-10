import { can, PERMISSIONS } from '../../shared/authorization';
import { Errors } from '../../shared/errors';
import type { AuthUser } from '../../shared/types';
import { buildTicketContext, frameTicketContext } from './context/ticket-context';
import { createAIProvider } from './providers';
import type { AIProvider } from './providers/ai-provider';
import { retrieveAuthorizedContext } from './sources/retrieval';
import { frameAsData, tokenize } from './sources/sources.policy';
import type { SourceReference } from './sources/sources.types';

export const INSUFFICIENT_INFORMATION =
  'No hay información autorizada suficiente para responder esta consulta. Agrega más detalles (equipo, mensaje de error, qué ya probaste) o solicita la revisión del equipo de soporte.';

export const NEEDS_MORE_INFORMATION =
  'Necesito más datos para orientar el diagnóstico. Describe el problema con más detalle.';

export type AuthorizedAnswer =
  | { status: 'insufficient_information'; message: string; references: []; aiGenerated: true }
  | {
      status: 'needs_more_info';
      message: string;
      additionalInformation: string[];
      references: SourceReference[];
      aiGenerated: true;
    }
  | {
      status: 'answered';
      answer: string;
      recommendation: string;
      steps: string[];
      additionalInformation: string[];
      references: SourceReference[];
      aiGenerated: true;
    };

const insufficient = (): AuthorizedAnswer => ({
  status: 'insufficient_information',
  message: INSUFFICIENT_INFORMATION,
  references: [],
  aiGenerated: true,
});

/**
 * Responde SOLO con fuentes autorizadas (AIR-002). Sin fuentes válidas no se llama al modelo ni se
 * rellenan huecos con supuestos organizacionales: la respuesta es "información insuficiente".
 * Cada referencia identifica fuente, versión y fragmento usados (AIR-007) y SIEMPRE proviene de los
 * fragmentos recuperados: lo que el modelo cite y no se haya recuperado se descarta.
 */
export async function askWithAuthorizedSources(
  question: string,
  user: AuthUser,
  provider: AIProvider = createAIProvider(),
  options: { ticketId?: number } = {},
): Promise<AuthorizedAnswer> {
  // AIR-008: permiso y acceso al ticket se verifican ANTES de recuperar o enviar nada al modelo.
  if (!can(user, PERMISSIONS.AI_QUERY)) throw Errors.forbidden();
  const ticketContext =
    options.ticketId === undefined ? undefined : await buildTicketContext(options.ticketId, user);

  // Consulta ambigua: se pide más información sin consumir una llamada al proveedor.
  if (tokenize(question).length < 2) {
    return {
      status: 'needs_more_info',
      message: NEEDS_MORE_INFORMATION,
      additionalInformation: ['¿Qué equipo o sistema falla?', '¿Qué mensaje o síntoma aparece?', '¿Qué intentaste ya?'],
      references: [],
      aiGenerated: true,
    };
  }

  const retrieval = await retrieveAuthorizedContext(question, user);
  if (!retrieval.sufficient) return insufficient();

  const answer = await provider.ask(question, [
    ...(ticketContext
      ? [{ articleId: 0, sourceType: 'ticket' as const, sourceId: ticketContext.ticketId, content: frameTicketContext(ticketContext) }]
      : []),
    ...retrieval.fragments.map((fragment) => {
      const { content, ...reference } = fragment;
      return {
        articleId: fragment.sourceId,
        sourceType: fragment.sourceType,
        sourceId: fragment.sourceId,
        sourceVersion: fragment.sourceVersion,
        chunkIndex: fragment.chunkIndex,
        authorizationId: fragment.authorizationId,
        // Dato enmarcado: el contenido de la fuente nunca se mezcla con instrucciones.
        content: frameAsData(reference, content),
      };
    }),
  ]);

  // AIR-008: si durante la generación se retiró una fuente o el acceso al ticket, no se entrega el resultado.
  if (options.ticketId !== undefined) await buildTicketContext(options.ticketId, user);
  const stillValid = await retrieveAuthorizedContext(question, user);
  const validKeys = new Set(stillValid.fragments.map((f) => `${f.authorizationId}:${f.chunkIndex}`));
  if (!retrieval.fragments.every((f) => validKeys.has(`${f.authorizationId}:${f.chunkIndex}`))) return insufficient();

  // Referencias: solo fragmentos recuperados y autorizados (nunca enlaces ni fuentes inventados por el modelo).
  const cited = answer.citations === undefined ? undefined : new Set(answer.citations);
  const usedFragments = cited ? retrieval.fragments.filter((f) => cited.has(f.authorizationId)) : retrieval.fragments;
  const references = usedFragments.map(({ content: _content, ...reference }) => reference);

  const additionalInformation = answer.additionalInformation ?? [];

  if (answer.needsMoreInfo) {
    return {
      status: 'needs_more_info',
      message: NEEDS_MORE_INFORMATION,
      additionalInformation,
      references,
      aiGenerated: true,
    };
  }

  // Recomendación sin respaldo verificable en lo recuperado: no se presenta como recomendación.
  if (references.length === 0) return insufficient();

  const recommendation = answer.recommendation?.trim() || answer.text;
  return {
    status: 'answered',
    answer: answer.text,
    recommendation,
    steps: answer.steps ?? [],
    additionalInformation,
    references,
    aiGenerated: true,
  };
}
