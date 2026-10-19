/**
 * Contrato del almacenamiento de adjuntos (FR-004, FR-012). El módulo `files` depende solo de
 * esta interfaz; el proveedor real (disco, S3, etc.) se elige por entorno en `./index.ts`.
 */
export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer | undefined>;
  delete(key: string): Promise<void>;
}
