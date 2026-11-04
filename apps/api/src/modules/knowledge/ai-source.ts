import { createHash } from 'node:crypto';
import { can, PERMISSIONS } from '../../shared/authorization';
import type { AuthUser } from '../../shared/types';
import { readDocumentFile } from '../files';
import * as documents from './documents.repository';
import { knowledgeRepository } from './knowledge.repository';

/**
 * Lectura de fuentes para el asistente de IA (AIR-002).
 *
 * Aquí NO se decide la autorización para IA (eso vive en `ai/sources`); solo se informa del estado
 * real de la biblioteca: identidad, versión, huella del contenido, si es elegible (aprobado/publicado)
 * y si un usuario concreto puede leerla (permiso humano, independiente de la autorización de IA).
 */
export type KnowledgeSourceType = 'article' | 'document';

export type SourceContent =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; buffer: Buffer };

export interface KnowledgeSourceSnapshot {
  type: KnowledgeSourceType;
  id: number;
  title: string;
  /** Versión del contenido (artículo: número de versión; documento: identificador de versión del archivo). */
  version: string;
  /** Huella SHA-256 del contenido: una edición distinta nunca hereda la aprobación. */
  contentHash: string;
  /** Aprobado (artículo) o publicado (documento). Borradores y retirados no son elegibles. */
  eligible: boolean;
  ineligibleReason?: string;
  /** Permiso de lectura humana del usuario consultado (true cuando no se consulta por usuario). */
  visibleToUser: boolean;
  loadContent(): Promise<SourceContent>;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function snapshotArticle(
  id: number,
  user: AuthUser | null,
): Promise<KnowledgeSourceSnapshot | null> {
  const article = await knowledgeRepository.findById(id);
  if (!article) return null;

  const text = [
    article.title,
    article.problemDescription,
    article.symptoms,
    article.solution,
    article.verification,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n');

  const eligible = article.status === 'approved';

  return {
    type: 'article',
    id: article.id,
    title: article.title,
    version: String(article.version),
    contentHash: sha256(text),
    eligible,
    ineligibleReason: eligible ? undefined : `El artículo está en estado "${article.status}".`,
    visibleToUser:
      user === null ||
      (can(user, PERMISSIONS.KNOWLEDGE_READ) &&
        (article.status === 'approved' ||
          can(user, PERMISSIONS.KNOWLEDGE_PUBLISH) ||
          article.authorId === user.id)),
    loadContent: async () => ({ kind: 'text', text }),
  };
}

export async function snapshotDocument(
  id: number,
  user: AuthUser | null,
): Promise<KnowledgeSourceSnapshot | null> {
  const record = await documents.transaction(async (client) => {
    const raw = await documents.findDocumentUnrestricted(client, id);
    if (!raw) return null;
    const visible =
      user === null
        ? true
        : can(user, PERMISSIONS.KNOWLEDGE_READ) && Boolean(await documents.findDocument(client, id, user));
    return { raw, visible };
  });
  if (!record) return null;

  const { raw, visible } = record;
  const eligible = raw.status === 'published';

  return {
    type: 'document',
    id: raw.id,
    title: raw.title,
    version: raw.versionId,
    contentHash: raw.sha256,
    eligible,
    ineligibleReason: eligible ? undefined : `El documento está en estado "${raw.status}".`,
    visibleToUser: visible,
    loadContent: async () => {
      const file = await documents.transaction((client) => readDocumentFile(client, raw.fileId));
      return { kind: 'pdf', buffer: file.content };
    },
  };
}
