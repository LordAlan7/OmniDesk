import { env } from '../../../config/env';
import { recordAuditInMemory } from '../../audit';
import { postgresSourcesRepository } from './sources.postgres.repository';
import type {
  AiSourceAuthorization,
  AiSourceChunk,
  AiSourceType,
  AuthorizationFilters,
  NewChunk,
} from './sources.types';

/** Evento de auditoría que se confirma junto con el cambio (misma transacción en PostgreSQL). */
export type SourceAudit = Parameters<typeof recordAuditInMemory>[0];

export type NewAuthorization = Pick<
  AiSourceAuthorization,
  'sourceType' | 'sourceId' | 'sourceVersion' | 'contentHash' | 'title' | 'requestedBy'
>;

export interface SourcesRepository {
  create(data: NewAuthorization, audit: SourceAudit): Promise<AiSourceAuthorization>;
  findById(id: number): Promise<AiSourceAuthorization | undefined>;
  /** Solicitud vigente (pendiente o aprobada) para la misma fuente, versión y contenido. */
  findActive(
    type: AiSourceType,
    id: number,
    version: string,
    contentHash: string,
  ): Promise<AiSourceAuthorization | undefined>;
  list(filters: AuthorizationFilters): Promise<AiSourceAuthorization[]>;
  /** Persiste los campos de decisión/estado y, en la misma transacción, el evento de auditoría. */
  save(authorization: AiSourceAuthorization, audit: SourceAudit): Promise<AiSourceAuthorization>;
  /** Guarda los fragmentos y el resultado de la ingesta junto con su evento de auditoría. */
  completeIngestion(authorizationId: number, chunks: NewChunk[], audit: SourceAudit): Promise<AiSourceAuthorization>;
  failIngestion(authorizationId: number, error: string, audit: SourceAudit): Promise<AiSourceAuthorization>;
  /** Marca los fragmentos como no utilizables (el índice es derivado; la autorización manda). */
  invalidateChunks(authorizationId: number): Promise<void>;
  /** Fragmentos de autorizaciones aprobadas e ingeridas. Aún deben verificarse contra la biblioteca. */
  listApprovedChunks(): Promise<AiSourceChunk[]>;
}

// ───────────────────────────── Memoria (pruebas y desarrollo sin BD) ─────────────────────────────
interface StoredChunk extends AiSourceChunk {
  invalidated: boolean;
}

const authorizations: AiSourceAuthorization[] = [];
const chunks: StoredChunk[] = [];
let nextAuthorizationId = 1;
let nextChunkId = 1;

const now = () => new Date().toISOString();

const memorySourcesRepository: SourcesRepository = {
  async create(data, audit) {
    const record: AiSourceAuthorization = {
      ...data,
      id: nextAuthorizationId++,
      status: 'pending',
      requestedAt: now(),
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      revokedBy: null,
      revokedAt: null,
      revocationReason: null,
      invalidatedAt: null,
      invalidationReason: null,
      ingestionStatus: 'not_ingested',
      ingestionError: null,
      ingestedAt: null,
      chunkCount: 0,
    };
    authorizations.push(record);
    recordAuditInMemory({ ...audit, entityId: record.id });
    return { ...record };
  },

  async findById(id) {
    const found = authorizations.find((a) => a.id === id);
    return found && { ...found };
  },

  async findActive(type, id, version, contentHash) {
    const found = authorizations.find(
      (a) =>
        a.sourceType === type &&
        a.sourceId === id &&
        a.sourceVersion === version &&
        a.contentHash === contentHash &&
        (a.status === 'pending' || a.status === 'approved'),
    );
    return found && { ...found };
  },

  async list(filters) {
    return authorizations
      .filter(
        (a) =>
          (!filters.status || a.status === filters.status) &&
          (!filters.sourceType || a.sourceType === filters.sourceType) &&
          (filters.sourceId === undefined || a.sourceId === filters.sourceId),
      )
      .map((a) => ({ ...a }))
      .reverse();
  },

  async save(authorization, audit) {
    const current = authorizations.find((a) => a.id === authorization.id);
    if (!current) throw new Error('Authorization not found');
    Object.assign(current, authorization);
    recordAuditInMemory(audit);
    return { ...current };
  },

  async completeIngestion(authorizationId, newChunks, audit) {
    const current = authorizations.find((a) => a.id === authorizationId);
    if (!current) throw new Error('Authorization not found');
    for (const chunk of chunks.filter((c) => c.authorizationId === authorizationId)) chunk.invalidated = true;
    for (const chunk of newChunks) {
      chunks.push({ ...chunk, id: nextChunkId++, authorizationId, invalidated: false });
    }
    Object.assign(current, {
      ingestionStatus: 'ingested',
      ingestionError: null,
      ingestedAt: now(),
      chunkCount: newChunks.length,
    });
    recordAuditInMemory(audit);
    return { ...current };
  },

  async failIngestion(authorizationId, error, audit) {
    const current = authorizations.find((a) => a.id === authorizationId);
    if (!current) throw new Error('Authorization not found');
    Object.assign(current, { ingestionStatus: 'failed', ingestionError: error, ingestedAt: null, chunkCount: 0 });
    recordAuditInMemory(audit);
    return { ...current };
  },

  async invalidateChunks(authorizationId) {
    for (const chunk of chunks) {
      if (chunk.authorizationId === authorizationId) chunk.invalidated = true;
    }
  },

  async listApprovedChunks() {
    return chunks
      .filter((chunk) => {
        const owner = authorizations.find((a) => a.id === chunk.authorizationId);
        return !chunk.invalidated && owner?.status === 'approved' && owner.ingestionStatus === 'ingested';
      })
      .map(({ invalidated: _ignored, ...chunk }) => ({ ...chunk }));
  },
};

export function resetSourcesRepository(): void {
  authorizations.length = 0;
  chunks.length = 0;
  nextAuthorizationId = 1;
  nextChunkId = 1;
}

const useMemory = env.nodeEnv === 'test';

export const sourcesRepository: SourcesRepository = useMemory ? memorySourcesRepository : postgresSourcesRepository;
