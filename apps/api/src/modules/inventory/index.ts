/**
 * Módulo INVENTORY.
 * API pública: otros módulos SOLO deben importar desde este archivo.
 */
export { inventoryRouter } from './inventory.routes';
export { InventoryService } from './inventory.service';

export type {
  InventoryProvider,
  InventoryVehicle,
  InventoryProduct,
  InventoryWarranty,
  InventoryList,
  InventoryQuery,
} from './inventory.types';