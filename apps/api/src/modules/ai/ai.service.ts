import type { AuthUser } from '../../shared/types';
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
): Promise<AuthorizedAnswer> {
  const retrieval = await retrieveAuthorizedContext(question, user);

  if (!retrieval.sufficient) {
    return { status: 'insufficient_information', message: INSUFFICIENT_INFORMATION, references: [], aiGenerated: true };
  }

  const answer = await provider.ask(
    question,
    retrieval.fragments.map((fragment) => {
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
  );

  return {
    status: 'answered',
    answer: answer.text,
    references: retrieval.fragments.map(({ content: _content, ...reference }) => reference),
    aiGenerated: true,
  };
}
