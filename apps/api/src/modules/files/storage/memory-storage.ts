import type { StorageProvider, StoredObject } from './storage-provider';

/** Almacenamiento en memoria para desarrollo y pruebas: sin disco ni red. */
export class InMemoryStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, { data: Buffer; contentType: string }>();

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { data, contentType });
    return { key, size: data.length, contentType };
  }

  async get(key: string): Promise<Buffer | undefined> {
    return this.objects.get(key)?.data;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
