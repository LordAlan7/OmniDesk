import type { AuthUser } from '../../../shared/types';
import {
  snapshotArticle,
  snapshotDocument,
  type KnowledgeSourceSnapshot,
} from '../../knowledge';
import type { AiSourceType } from './sources.types';

/**
 * Único punto por el que `ai/sources` consulta el estado real de una fuente en la biblioteca.
 * `user = null` consulta sin permisos de usuario (verificación de la fuente en sí).
 */
export interface SourceReader {
  read(type: AiSourceType, id: number, user: AuthUser | null): Promise<KnowledgeSourceSnapshot | null>;
}

export const knowledgeSourceReader: SourceReader = {
  read: (type, id, user) => (type === 'article' ? snapshotArticle(id, user) : snapshotDocument(id, user)),
};

let reader: SourceReader = knowledgeSourceReader;

export const getSourceReader = (): SourceReader => reader;

/** Permite sustituir el lector (pruebas). */
export function configureSourceReader(next: SourceReader): void {
  reader = next;
}

export function resetSourceReader(): void {
  reader = knowledgeSourceReader;
}
