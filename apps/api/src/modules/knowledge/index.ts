/**
 * Módulo KNOWLEDGE - Knowledge Base
 * Requisitos: FR-011, FR-012, FR-019
 * Dependencias permitidas: files, audit
 * ESTADO: FR-011 y FR-012 implementados; FR-019 pendiente.
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { knowledgeRouter } from './knowledge.routes';

// FR-009: punto de validación de referencias a artículos aprobados.
// Lo usa app.ts para inyectar el validador en el módulo tickets (rompe el ciclo
// tickets → knowledge → files → tickets). No requiere usuario: los artículos
// aprobados son legibles por cualquier usuario autenticado (FR-011).
export { findApprovedArticleById } from './knowledge.service';

export type { KnowledgeArticle } from './knowledge.types';