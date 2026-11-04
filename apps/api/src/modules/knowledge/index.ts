/**
 * Módulo KNOWLEDGE - Knowledge Base
 * Requisitos: FR-011, FR-012, FR-019
 * Dependencias permitidas: files, audit
 */
export { knowledgeRouter } from './knowledge.routes';

// FR-009: punto de validación de referencias a artículos aprobados.
// Lo usa app.ts para inyectar el validador en el módulo tickets (rompe el ciclo
// tickets → knowledge → files → tickets). No requiere usuario: los artículos
// aprobados son legibles por cualquier usuario autenticado (FR-011).
export { findApprovedArticleById, getArticle  } from './knowledge.service';

// AIR-002: estado real de las fuentes (versión, huella, elegibilidad y permiso de lectura del usuario).
export { snapshotArticle, snapshotDocument } from './ai-source';
export type { KnowledgeSourceSnapshot, KnowledgeSourceType, SourceContent } from './ai-source';

export type { KnowledgeArticle } from './knowledge.types';