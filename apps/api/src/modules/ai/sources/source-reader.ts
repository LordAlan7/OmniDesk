import type { AuthUser } from '../../../shared/types';
import { aiPorts } from '../ai.ports';
import type { AiSourceType, KnowledgeSourceSnapshot } from './sources.types';

/**
 * Único punto por el que `ai/sources` consulta el estado real de una fuente en la biblioteca.
 * `user = null` consulta sin permisos de usuario (verificación de la fuente en sí).
 */
export interface SourceReader {
  read(type: AiSourceType, id: number, user: AuthUser | null): Promise<KnowledgeSourceSnapshot | null>;
}

/**
 * Lector por defecto (paso 8): delega en el puerto de conocimiento inyectado por app.ts.
 * El módulo `ai` ya no importa `knowledge`; el adaptador real (snapshotArticle/snapshotDocument)
 * vive en la raíz de composición.
 */
export const knowledgeSourceReader: SourceReader = {
  read: (type, id, user) => aiPorts().knowledge.readSource(type, id, user),
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