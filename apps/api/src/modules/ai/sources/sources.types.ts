/**
 * Fuentes de conocimiento autorizadas para IA (AIR-002).
 *
 * Estar en la biblioteca NO implica autorización para IA. Una autorización identifica una fuente,
 * una versión y la huella exacta de su contenido; una edición nueva no hereda la aprobación.
 */
export type AiSourceType = 'article' | 'document';

export const AI_SOURCE_TYPES: readonly AiSourceType[] = ['article', 'document'];

export type AuthorizationStatus =
  | 'pending' //     propuesta, sin efecto
  | 'approved' //    única condición bajo la que se puede usar (junto con el permiso del usuario)
  | 'rejected' //    el revisor la negó
  | 'revoked' //     retirada explícitamente
  | 'invalidated'; // dejó de ser válida (nueva versión, retirada de la biblioteca…)

export type IngestionStatus = 'not_ingested' | 'ingested' | 'failed';

export type InvalidationReason =
  | 'version_changed'
  | 'source_not_eligible'
  | 'source_unavailable';

export interface AiSourceAuthorization {
  id: number;
  sourceType: AiSourceType;
  sourceId: number;
  /** Versión autorizada (artículo: nº de versión; documento: id de versión del archivo). */
  sourceVersion: string;
  /** Huella SHA-256 del contenido autorizado. */
  contentHash: string;
  /** Título al momento de la solicitud (referencia legible; no sustituye al contenido). */
  title: string;
  status: AuthorizationStatus;
  requestedBy: number;
  requestedAt: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  revokedBy: number | null;
  revokedAt: string | null;
  revocationReason: string | null;
  invalidatedAt: string | null;
  invalidationReason: InvalidationReason | null;
  ingestionStatus: IngestionStatus;
  ingestionError: string | null;
  ingestedAt: string | null;
  chunkCount: number;
}

/** Fragmento indexado: conserva origen y versión. Por sí solo NUNCA autoriza el uso del contenido. */
export interface AiSourceChunk {
  id: number;
  authorizationId: number;
  sourceType: AiSourceType;
  sourceId: number;
  sourceVersion: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
}

export type NewChunk = Omit<AiSourceChunk, 'id' | 'authorizationId'>;

export interface AuthorizationFilters {
  status?: AuthorizationStatus;
  sourceType?: AiSourceType;
  sourceId?: number;
}

/** Identificación del contenido usado en una respuesta (AIR-007). */
export interface SourceReference {
  authorizationId: number;
  sourceType: AiSourceType;
  sourceId: number;
  sourceVersion: string;
  title: string;
  chunkIndex: number;
}

export interface RetrievedFragment extends SourceReference {
  content: string;
}

export type ExclusionReason =
  | 'user_not_permitted'
  | InvalidationReason
  | 'not_approved';

export interface RetrievalResult {
  /** false = información insuficiente: no se debe llamar al modelo ni suponer datos organizacionales. */
  sufficient: boolean;
  fragments: RetrievedFragment[];
  /** Fuentes descartadas y motivo (para pruebas y revisión; no se muestra a usuarios finales). */
  excluded: { authorizationId: number; reason: ExclusionReason }[];
}
