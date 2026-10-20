import { env } from '../../../config/env';
import { InMemoryStorageProvider } from './memory-storage';
import type { StorageProvider } from './storage-provider';

/** Único punto donde se elige el almacenamiento según el entorno (STORAGE_PROVIDER). */
export function createStorageProvider(name: string = env.storageProvider): StorageProvider {
  switch (name) {
    case 'memory':
      return new InMemoryStorageProvider();
    default:
      throw new Error(`Unknown STORAGE_PROVIDER "${name}". Register it in modules/files/storage/index.ts.`);
  }
}
