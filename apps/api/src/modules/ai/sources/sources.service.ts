import { can, PERMISSIONS } from '../../../shared/authorization';
import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';
import type { KnowledgeSourceSnapshot } from '../../knowledge';
import { getSourceReader } from './source-reader';
import { chunkText } from './sources.policy';
import { sourcesRepository as repository, type SourceAudit } from './sources.repository';
import type {
  AiSourceAuthorization,
  AiSourceType,
  AuthorizationFilters,
  InvalidationReason,
} from './sources.types';

/**
 * Extracción de texto de PDFs para la ingesta. Sin extractor configurado la ingesta de un documento
 * FALLA de forma explícita (queda registrada) y el documento no se usa: indexar mal no autoriza.
 */
export interface DocumentTextExtractor {
  extract(buffer: Buffer): Promise<string>;
}

let extractor: DocumentTextExtractor = {
  async extract() {
    throw new Error('La extracción de texto de PDF no está configurada.');
  },
};

export function configureDocumentTextExtractor(next: DocumentTextExtractor): void {
  extractor = next;
}

const auditFor = (
  action: SourceAudit['action'],
  authorization: Pick<AiSourceAuthorization, 'id' | 'sourceType' | 'sourceId' | 'sourceVersion' | 'contentHash'>,
  actorId: number | null,
  extra: Record<string, unknown> = {},
): SourceAudit => ({
  action,
  entity: 'ai_source',
  entityId: authorization.id,
  actorId,
  metadata: {
    sourceType: authorization.sourceType,
    sourceId: authorization.sourceId,
    version: authorization.sourceVersion,
    contentHash: authorization.contentHash,
    ...extra,
  },
});

function requirePermission(user: AuthUser, permission: Parameters<typeof can>[1]): void {
  if (!can(user, permission)) throw Errors.forbidden();
}

async function mustFind(id: number): Promise<AiSourceAuthorization> {
  const found = await repository.findById(id);
  if (!found) throw Errors.notFound('AI source authorization');
  return found;
}

/** Marca la autorización como inválida, retira sus fragmentos y lo audita. */
export async function invalidate(
  authorization: AiSourceAuthorization,
  reason: InvalidationReason,
): Promise<AiSourceAuthorization> {
  const saved = await repository.save(
    {
      ...authorization,
      status: 'invalidated',
      invalidatedAt: new Date().toISOString(),
      invalidationReason: reason,
    },
    auditFor('ai.source_invalidated', authorization, null, { reason }),
  );
  await repository.invalidateChunks(authorization.id);
  return saved;
}

/** Comprueba, contra la biblioteca real, que lo autorizado sigue siendo exactamente lo vigente. */
export function checkAgainstSource(
  authorization: Pick<AiSourceAuthorization, 'sourceVersion' | 'contentHash'>,
  snapshot: KnowledgeSourceSnapshot | null,
): InvalidationReason | null {
  if (!snapshot) return 'source_unavailable';
  if (!snapshot.eligible) return 'source_not_eligible';
  if (snapshot.version !== authorization.sourceVersion || snapshot.contentHash !== authorization.contentHash) {
    return 'version_changed';
  }
  return null;
}

/** Propone una fuente (y su versión exacta). No tiene efecto hasta que otra persona la apruebe. */
export async function requestAuthorization(
  sourceType: AiSourceType,
  sourceId: number,
  user: AuthUser,
): Promise<AiSourceAuthorization> {
  requirePermission(user, PERMISSIONS.AI_SOURCES_REQUEST);

  const snapshot = await getSourceReader().read(sourceType, sourceId, user);
  if (!snapshot || !snapshot.visibleToUser) throw Errors.notFound('Source');

  if (!snapshot.eligible) {
    throw Errors.invalidState(
      `Solo se pueden proponer artículos aprobados o documentos publicados. ${snapshot.ineligibleReason ?? ''}`.trim(),
    );
  }

  if (await repository.findActive(sourceType, sourceId, snapshot.version, snapshot.contentHash)) {
    throw Errors.conflict('Ya existe una solicitud vigente para esta versión de la fuente.');
  }

  const identity = {
    sourceType,
    sourceId,
    sourceVersion: snapshot.version,
    contentHash: snapshot.contentHash,
  };

  return repository.create(
    { ...identity, title: snapshot.title, requestedBy: user.id },
    auditFor('ai.source_requested', { id: 0, ...identity }, user.id),
  );
}

async function ingest(
  authorization: AiSourceAuthorization,
  snapshot: KnowledgeSourceSnapshot,
): Promise<AiSourceAuthorization> {
  try {
    const content = await snapshot.loadContent();
    const text = content.kind === 'text' ? content.text : await extractor.extract(content.buffer);
    const chunks = chunkText(text, {
      sourceType: authorization.sourceType,
      sourceId: authorization.sourceId,
      sourceVersion: authorization.sourceVersion,
    });

    if (chunks.length === 0) throw new Error('La fuente no contiene texto utilizable.');

    return await repository.completeIngestion(
      authorization.id,
      chunks,
      auditFor('ai.source_ingested', authorization, null, { chunks: chunks.length }),
    );
  } catch (cause) {
    // Se registra el motivo (sin contenido ni credenciales) y la fuente queda sin fragmentos utilizables.
    const message = cause instanceof Error ? cause.message.slice(0, 300) : 'Error de extracción.';
    return repository.failIngestion(
      authorization.id,
      message,
      auditFor('ai.source_ingestion_failed', authorization, null, { error: message }),
    );
  }
}

/** Aprueba o rechaza una propuesta. Quien aprueba no puede ser quien la propuso. */
export async function review(
  id: number,
  decision: 'approve' | 'reject',
  note: string | undefined,
  user: AuthUser,
): Promise<AiSourceAuthorization> {
  requirePermission(user, PERMISSIONS.AI_SOURCES_REVIEW);

  const authorization = await mustFind(id);
  if (authorization.status !== 'pending') {
    throw Errors.invalidState(`La solicitud está en estado "${authorization.status}" y no puede revisarse.`);
  }
  if (authorization.requestedBy === user.id) {
    throw Errors.forbidden('Quien propone una fuente no puede aprobarla (separación de funciones).');
  }

  if (decision === 'reject') {
    if (!note) throw Errors.validation([{ field: 'note', message: 'El motivo del rechazo es obligatorio.' }]);
    return repository.save(
      { ...authorization, status: 'rejected', reviewedBy: user.id, reviewedAt: new Date().toISOString(), reviewNote: note },
      auditFor('ai.source_rejected', authorization, user.id, { note }),
    );
  }

  // La aprobación solo vale para la versión y el contenido que se están revisando AHORA.
  const snapshot = await getSourceReader().read(authorization.sourceType, authorization.sourceId, null);
  const stale = checkAgainstSource(authorization, snapshot);
  if (stale || !snapshot) {
    await invalidate(authorization, stale ?? 'source_unavailable');
    throw Errors.conflict('La fuente cambió o dejó de ser elegible desde que se propuso. Propón la versión vigente.');
  }

  const approved = await repository.save(
    {
      ...authorization,
      status: 'approved',
      reviewedBy: user.id,
      reviewedAt: new Date().toISOString(),
      reviewNote: note ?? null,
    },
    auditFor('ai.source_approved', authorization, user.id, note ? { note } : {}),
  );

  return ingest(approved, snapshot);
}

/** Retira una autorización aprobada: deja de usarse de inmediato, aunque el índice conserve fragmentos. */
export async function revoke(id: number, reason: string, user: AuthUser): Promise<AiSourceAuthorization> {
  requirePermission(user, PERMISSIONS.AI_SOURCES_REVIEW);

  const authorization = await mustFind(id);
  if (authorization.status !== 'approved') {
    throw Errors.invalidState(`Solo se puede retirar una autorización aprobada (estado: "${authorization.status}").`);
  }

  const saved = await repository.save(
    {
      ...authorization,
      status: 'revoked',
      revokedBy: user.id,
      revokedAt: new Date().toISOString(),
      revocationReason: reason,
    },
    auditFor('ai.source_revoked', authorization, user.id, { reason }),
  );
  await repository.invalidateChunks(authorization.id);
  return saved;
}

/** Invalida las autorizaciones aprobadas cuyo contenido cambió o dejó de ser elegible. */
export async function reconcile(): Promise<number> {
  let invalidated = 0;
  for (const authorization of await repository.list({ status: 'approved' })) {
    const snapshot = await getSourceReader().read(authorization.sourceType, authorization.sourceId, null);
    const reason = checkAgainstSource(authorization, snapshot);
    if (reason) {
      await invalidate(authorization, reason);
      invalidated += 1;
    }
  }
  return invalidated;
}

export async function listAuthorizations(
  filters: AuthorizationFilters,
  user: AuthUser,
): Promise<AiSourceAuthorization[]> {
  requirePermission(user, PERMISSIONS.AI_SOURCES_READ);
  await reconcile();
  return repository.list(filters);
}

export async function getAuthorization(id: number, user: AuthUser): Promise<AiSourceAuthorization> {
  requirePermission(user, PERMISSIONS.AI_SOURCES_READ);
  await reconcile();
  return mustFind(id);
}

/**
 * Estado de una referencia histórica (respuesta ya generada): ¿su fuente y versión siguen autorizadas?
 * Permite marcar respuestas antiguas apoyadas en contenido retirado o invalidado, sin borrarlas.
 */
export async function referenceStatus(
  authorizationId: number,
): Promise<'current' | 'withdrawn' | 'unknown'> {
  const authorization = await repository.findById(authorizationId);
  if (!authorization) return 'unknown';
  return authorization.status === 'approved' ? 'current' : 'withdrawn';
}
