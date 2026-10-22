/**
 * Módulo FILES - File & Attachment Management
 * Requisitos: FR-004 (Evidencia de tickets), FR-012 (Manuales y documentación)
 * Dependencias permitidas: tickets, audit
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */

// Enrutador principal del módulo de archivos
export { filesRouter } from './files.routes';

// Adaptadores de almacenamiento (Storage Provider)
export { createStorageProvider } from './storage';
export type { StorageProvider, StoredObject } from './storage/storage-provider';

// Validación y almacenamiento de documentos de conocimiento (FR-012)
export { MAX_DOCUMENT_BYTES, validateDocumentPdf, storeDocumentFile, readDocumentFile } from './document-storage';

// Validación y límites de adjuntos de tickets (FR-004)
export { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TICKET, validateAttachment } from './ticket-storage';

// Tipos compartidos
export type { TicketAttachment } from './files.types';