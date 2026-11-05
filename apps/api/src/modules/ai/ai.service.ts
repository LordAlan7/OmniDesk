import { can, PERMISSIONS } from '../../shared/authorization';
import { Errors } from '../../shared/errors';
import type { AuthUser } from '../../shared/types';
import { buildTicketContext, frameTicketContext } from './context/ticket-context';
import { createAIProvider } from './providers';
import type { AIProvider } from './providers/ai-provider';
import { retrieveAuthorizedContext } from './sources/retrieval';
import { frameAsData } from './sources/sources.policy';
import type { SourceReference } from './sources/sources.types';

export const INSUFFICIENT_INFORMATION =
  'No hay información autorizada suficiente para responder esta consulta.';

export type AuthorizedAnswer =
  | { status: 'insufficient_information'; message: string; references: []; aiGenerated: true }
  | { status: 'answered'; answer: string; references: SourceReference[]; aiGenerated: true };

/**
 * Responde SOLO con fuentes autorizadas (AIR-002). Sin fuentes válidas no se llama al modelo ni se
 * rellenan huecos con supuestos organizacionales: la respuesta es "información insuficiente".
 * Cada referencia identifica fuente, versión y fragmento usados (AIR-007).
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

  const retrieval = await retrieveAuthorizedContext(question, user);

  if (!retrieval.sufficient) {
    return { status: 'insufficient_information', message: INSUFFICIENT_INFORMATION, references: [], aiGenerated: true };
  }

  const answer = await provider.ask(
    question,
    [
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
    ],
  );

  // AIR-008: si durante la generación se retiró una fuente o el acceso al ticket, no se entrega el resultado.
  if (options.ticketId !== undefined) await buildTicketContext(options.ticketId, user);
  const stillValid = await retrieveAuthorizedContext(question, user);
  const validKeys = new Set(stillValid.fragments.map((f) => `${f.authorizationId}:${f.chunkIndex}`));
  if (!retrieval.fragments.every((f) => validKeys.has(`${f.authorizationId}:${f.chunkIndex}`))) {
    return { status: 'insufficient_information', message: INSUFFICIENT_INFORMATION, references: [], aiGenerated: true };
  }

  return {
    status: 'answered',
    answer: answer.text,
    references: retrieval.fragments.map(({ content: _content, ...reference }) => reference),
    aiGenerated: true,
  };
}
