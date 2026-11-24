/**
 * Módulo Inventory — adaptador de la API de Inventario (contrato v1.0).
 * Dependencias permitidas: ninguna (solo shared/ y config/env).
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
import { env } from '../../config/env';
import { HttpInventoryProvider } from './http-provider';
import { MockInventoryProvider } from './mock-provider';
import type { InventoryProvider } from './inventory.types';

export type {
  InventoryCompatibleProduct,
  InventoryListMeta,
  InventoryLocation,
  InventoryProduct,
  InventoryProductFilters,
  InventoryProvider,
  InventoryStock,
  InventoryStockLocation,
  InventoryVehicle,
  InventoryVehicleEvent,
  InventoryVehicleModel,
  InventoryWarranty,
  StockLevel,
  VehicleEventType,
  VehicleStatus,
} from './inventory.types';
export { computeStockLevel } from './inventory.types';
export { vinSchema, uuidSchema, productFiltersSchema } from './inventory.schemas';
export { InventoryErrors } from './inventory-errors';

/**
 * Único punto donde se decide el proveedor de inventario (INVENTORY_PROVIDER),
 * mismo patrón que createAIProvider. 'mock' no llama a ningún servicio real;
 * 'http' requiere INVENTORY_API_URL + INVENTORY_API_CREDENTIAL (validado en env.ts).
 */
export function createInventoryProvider(name: string = env.inventoryProvider): InventoryProvider {
  switch (name) {
    case 'mock':
      return new MockInventoryProvider();
    case 'http':
      return new HttpInventoryProvider();
    default:
      throw new Error(
        `Unknown INVENTORY_PROVIDER "${name}". Register it in modules/inventory/index.ts.`,
      );
  }
}

let shared: InventoryProvider | undefined;

/** Instancia única (circuit breaker y caché compartidos entre rutas y tickets). */
export function getInventoryProvider(): InventoryProvider {
  shared ??= createInventoryProvider();
  return shared;
}