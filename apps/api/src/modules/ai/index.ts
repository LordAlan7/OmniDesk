/**
 * Módulo AI - AI Assistant + AI Validation & Review
 * Requisitos: FR-013, FR-014, FR-015, FR-021, NFR-003
 * Dependencias permitidas: knowledge, tickets, audit
 * ESTADO: esqueleto (los endpoints responden 501 hasta implementarse).
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { aiRouter } from './ai.routes';
export type { AIProvider, AIAnswer } from './providers/ai-provider';
export { createAIProvider } from './providers';
