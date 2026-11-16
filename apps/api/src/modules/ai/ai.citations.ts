import type {
  RetrievedFragment,
  SourceReference,
} from './sources/sources.types';

export interface AICitation {
  authorizationId: number;
  chunkIndex: number;
}

export function validateCitedReferences(
  citations: unknown,
  authorizedFragments: readonly RetrievedFragment[]
): SourceReference[] {
  if (!Array.isArray(citations)) {
    throw new Error('AI_CITATIONS_INVALID');
  }

  const allowed = new Map<string, RetrievedFragment>();

  for (const fragment of authorizedFragments) {
    const key = `${fragment.authorizationId}:${fragment.chunkIndex}`;
    allowed.set(key, fragment);
  }

  const references: SourceReference[] = [];
  const processed = new Set<string>();

  for (const citation of citations) {
    if (
      !citation ||
      typeof citation !== 'object' ||
      Array.isArray(citation)
    ) {
      throw new Error('AI_CITATIONS_INVALID');
    }

    const candidate = citation as Record<string, unknown>;
    const authorizationId = candidate.authorizationId;
    const chunkIndex = candidate.chunkIndex;

    if (
      typeof authorizationId !== 'number' ||
      !Number.isSafeInteger(authorizationId) ||
      authorizationId <= 0 ||
      typeof chunkIndex !== 'number' ||
      !Number.isSafeInteger(chunkIndex) ||
      chunkIndex < 0
    ) {
      throw new Error('AI_CITATIONS_INVALID');
    }

    const key = `${authorizationId}:${chunkIndex}`;
    const fragment = allowed.get(key);

    if (!fragment) {
      throw new Error('AI_CITATIONS_INVALID');
    }

    if (processed.has(key)) {
      continue;
    }

    processed.add(key);

    references.push({
      authorizationId: fragment.authorizationId,
      sourceType: fragment.sourceType,
      sourceId: fragment.sourceId,
      sourceVersion: fragment.sourceVersion,
      title: fragment.title,
      chunkIndex: fragment.chunkIndex,
    });
  }

  return references;
}