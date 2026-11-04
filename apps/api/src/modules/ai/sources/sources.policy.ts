import type { NewChunk, SourceReference } from './sources.types';
import { createHash } from 'node:crypto';

/** Tamaño máximo de un fragmento (caracteres). */
export const MAX_CHUNK_CHARS = 800;
/** Fragmentos máximos que se envían como contexto. */
export const MAX_CONTEXT_FRAGMENTS = 4;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Divide por párrafos y agrupa hasta MAX_CHUNK_CHARS, conservando origen y versión en cada fragmento. */
export function chunkText(
  text: string,
  origin: { sourceType: NewChunk['sourceType']; sourceId: number; sourceVersion: string },
): NewChunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    // Un párrafo enorme se parte en trozos del tamaño máximo.
    .flatMap((paragraph) =>
      paragraph.length <= MAX_CHUNK_CHARS
        ? [paragraph]
        : (paragraph.match(new RegExp(`[\\s\\S]{1,${MAX_CHUNK_CHARS}}`, 'g')) ?? []),
    );

  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    const last = chunks[chunks.length - 1];
    if (last !== undefined && last.length + paragraph.length + 2 <= MAX_CHUNK_CHARS) {
      chunks[chunks.length - 1] = `${last}\n\n${paragraph}`;
    } else {
      chunks.push(paragraph);
    }
  }

  return chunks.map((content, chunkIndex) => ({
    ...origin,
    chunkIndex,
    content,
    contentHash: sha256(content),
  }));
}

const STOPWORDS = new Set([
  'para', 'como', 'con', 'una', 'uno', 'los', 'las', 'del', 'que', 'por', 'este', 'esta', 'esto',
  'the', 'and', 'for', 'with', 'how', 'what', 'does', 'this', 'that', 'from', 'are', 'can',
]);

export function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 3 && !STOPWORDS.has(term)),
    ),
  ];
}

/**
 * Puntuación por coincidencia de términos. Es deliberadamente simple: la recuperación semántica real
 * pertenece al flujo RAG (AIR-001/FR-013); lo que AIR-002 garantiza es QUÉ fragmentos pueden competir.
 */
export function score(questionTerms: string[], content: string): number {
  const terms = new Set(tokenize(content));
  return questionTerms.filter((term) => terms.has(term)).length;
}

/**
 * Coincidencias mínimas para considerar relevante un fragmento: al menos la mitad de los términos de la
 * consulta. Evita que una palabra común ("reiniciar") convierta cualquier fuente en "suficiente".
 */
export const minimumMatches = (questionTerms: string[]): number =>
  Math.max(1, Math.ceil(questionTerms.length / 2));

/**
 * El contenido documental es DATO, no instrucciones: se enmarca con delimitadores y se neutralizan
 * los marcadores propios para que un documento no pueda cerrar el marco ni suplantar otra fuente.
 * Ninguna regla de autorización depende del texto de la fuente.
 */
export function frameAsData(reference: SourceReference, content: string): string {
  const safe = content.replace(/\[\/?SOURCE[^\]]*\]/gi, '[marcador-neutralizado]');
  return [
    `[SOURCE type=${reference.sourceType} id=${reference.sourceId} version=${reference.sourceVersion} chunk=${reference.chunkIndex}]`,
    safe,
    '[/SOURCE]',
  ].join('\n');
}
