/**
 * Módulo FILES - File & Attachment Management
 * Requisitos: FR-004, FR-012
 * Dependencias permitidas: tickets, audit
 * ESTADO: esqueleto (los endpoints responden 501 hasta implementarse).
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { filesRouter } from './files.routes';
export { createStorageProvider } from './storage';
export type { StorageProvider, StoredObject } from './storage/storage-provider';
