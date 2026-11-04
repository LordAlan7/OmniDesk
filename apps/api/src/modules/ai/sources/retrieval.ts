import { can, PERMISSIONS } from '../../../shared/authorization';
import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';
import { getSourceReader } from './source-reader';
import { MAX_CONTEXT_FRAGMENTS, minimumMatches, score, tokenize } from './sources.policy';
import { sourcesRepository as repository } from './sources.repository';
import { checkAgainstSource, invalidate } from './sources.service';
import type { AiSourceChunk, ExclusionReason, RetrievalResult } from './sources.types';

/**
 * Recuperación filtrada (AIR-002). Un fragmento solo entra al contexto si se cumplen A LA VEZ:
 *  1. existe una autorización APROBADA para esa fuente y versión exactas (independiente de la biblioteca);
 *  2. la fuente, consultada ahora en la biblioteca, sigue siendo elegible y conserva versión y huella;
 *  3. el usuario que consulta tiene permiso de lectura sobre la fuente.
 * Estar indexado no autoriza: el índice es solo un candidato y se verifica en cada consulta.
 * Si nada supera el filtro, el resultado es "información insuficiente".
 */
export async function retrieveAuthorizedContext(
  question: string,
  user: AuthUser,
  options: { limit?: number } = {},
): Promise<RetrievalResult> {
  if (!can(user, PERMISSIONS.AI_QUERY)) throw Errors.forbidden();

  const terms = tokenize(question);
  const excluded: RetrievalResult['excluded'] = [];
  if (terms.length === 0) return { sufficient: false, fragments: [], excluded };

  const byAuthorization = new Map<number, AiSourceChunk[]>();
  for (const chunk of await repository.listApprovedChunks()) {
    byAuthorization.set(chunk.authorizationId, [...(byAuthorization.get(chunk.authorizationId) ?? []), chunk]);
  }

  const scored: { chunk: AiSourceChunk; title: string; points: number }[] = [];

  for (const [authorizationId, chunks] of byAuthorization) {
    const authorization = await repository.findById(authorizationId);
    if (!authorization || authorization.status !== 'approved') {
      excluded.push({ authorizationId, reason: 'not_approved' });
      continue;
    }

    const snapshot = await getSourceReader().read(authorization.sourceType, authorization.sourceId, user);
    const stale = checkAgainstSource(authorization, snapshot);

    if (stale) {
      // La fuente cambió o se retiró: la autorización deja de valer para todos, no solo para este usuario.
      await invalidate(authorization, stale);
      excluded.push({ authorizationId, reason: stale });
      continue;
    }

    if (!snapshot?.visibleToUser) {
      excluded.push({ authorizationId, reason: 'user_not_permitted' satisfies ExclusionReason });
      continue;
    }

    for (const chunk of chunks) {
      // Un fragmento de otra versión o con otra huella nunca se usa aunque siga en el índice.
      if (chunk.sourceVersion !== authorization.sourceVersion) continue;
      const points = score(terms, chunk.content);
      if (points >= minimumMatches(terms)) scored.push({ chunk, title: authorization.title, points });
    }
  }

  const fragments = scored
    .sort((a, b) => b.points - a.points || a.chunk.authorizationId - b.chunk.authorizationId || a.chunk.chunkIndex - b.chunk.chunkIndex)
    .slice(0, options.limit ?? MAX_CONTEXT_FRAGMENTS)
    .map(({ chunk, title }) => ({
      authorizationId: chunk.authorizationId,
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      sourceVersion: chunk.sourceVersion,
      title,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
    }));

  return { sufficient: fragments.length > 0, fragments, excluded };
}
