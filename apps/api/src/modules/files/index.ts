/**
 * Módulo FILES - File & Attachment Management
 * Requisitos: FR-004, FR-012
 * Dependencias permitidas: tickets, audit
 * ESTADO: FR-012 implementado; los endpoints restantes conservan sus esqueletos 501.
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { filesRouter } from './files.routes';

export { MAX_DOCUMENT_BYTES, validateDocumentPdf, storeDocumentFile, readDocumentFile } from './document-storage';
