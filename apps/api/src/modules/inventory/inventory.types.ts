/**
 * Módulo Inventory — adaptador de la API de Inventario (contrato v1.0).
 * Dependencias permitidas: ninguna (solo shared/ y config/env).
 * API pública: otros módulos SOLO deben importar desde index.ts.
 */

export type VehicleStatus = 'IN_STOCK' | 'RESERVED' | 'SOLD' | 'RETURNED';
export type VehicleEventType = 'ENTRY' | 'SALE' | 'RETURN' | 'TRANSFER' | 'WARRANTY_CLAIM';
export type StockLevel = 'AVAILABLE' | 'LOW' | 'OUT';

export interface InventoryLocation {
  id: string;
  name: string;
  code?: string;
  type?: string;
}

/** §4 Vehicle: sin precio, coste ni datos de venta/cliente (se filtran en el esquema). */
export interface InventoryVehicle {
  id: string;
  vin: string;
  brand: string;
  model: string;
  modelId: string | null;
  year: number;
  status: VehicleStatus;
  locationId: string;
  modelStock: number;
}

export interface InventoryVehicleEvent {
  id: string;
  type: VehicleEventType;
  occurredAt: string;
  locationId: string | null;
}

/** §4 Warranty, confirmada contra la respuesta real de la API (paso 3). */
export interface InventoryWarranty {
  status: 'ACTIVE' | 'EXPIRED' | 'VOIDED' | 'NOT_APPLICABLE';
  startDate: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  coverage: string | null;
  voidedReason: string | null;
  openClaims: number;
}

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: { id: string; name: string } | null;
  status: string;
  codes: { value: string; format?: string | null; kind?: string | null }[];
}

/** §4 CompatibleProduct: campos de Product + stock calculado por el adaptador. */
export interface InventoryCompatibleProduct extends InventoryProduct {
  stockTotal: number;
  stockLevel: StockLevel;
}

export interface InventoryStockLocation {
  location: InventoryLocation;
  quantity: number;
  level: StockLevel;
}

export interface InventoryStock {
  productId: string;
  total: number;
  locations: InventoryStockLocation[];
}

export interface InventoryVehicleModel {
  id: string;
  brand: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  engineCc: number | null;
  status: string;
}

export interface InventoryListMeta {
  page?: number;
  limit?: number;
  total: number;
  totalPages?: number;
}

export interface InventoryProductFilters {
  search?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
}

/**
 * Contrato del proveedor de inventario (mismo patrón que AIProvider):
 * el resto del sistema depende SOLO de esta interfaz.
 */
export interface InventoryProvider {
  getVehicleByVin(vin: string): Promise<InventoryVehicle>;
  getVehicleById(id: string): Promise<InventoryVehicle>;
  getVehicleEvents(id: string): Promise<InventoryVehicleEvent[]>;
  getVehicleWarranty(id: string): Promise<InventoryWarranty>;
  getCompatibleProducts(id: string): Promise<InventoryCompatibleProduct[]>;
  listProducts(
    filters?: InventoryProductFilters,
  ): Promise<{ data: InventoryProduct[]; meta: InventoryListMeta }>;
  getProductByCode(value: string): Promise<InventoryProduct>;
  getProductById(id: string): Promise<InventoryProduct>;
  getProductStock(id: string): Promise<InventoryStock>;
  listVehicleModels(): Promise<InventoryVehicleModel[]>;
  getVehicleModelById(id: string): Promise<InventoryVehicleModel>;
}

/** §4: `level` lo calcula el adaptador (umbral INVENTORY_LOW_STOCK_THRESHOLD). */
export function computeStockLevel(quantity: number, threshold: number): StockLevel {
  if (quantity <= 0) return 'OUT';
  if (quantity < threshold) return 'LOW';
  return 'AVAILABLE';
}