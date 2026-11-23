
export interface InventoryVehicle {
  id: string;
  vin: string;
  brand: string;
  model: string;
  year: number;
  color?: string | null;
  status: string;
  modelStock?: number;
}

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  partNumber?: string | null;
  description?: string | null;
  price?: number | null;
  status: string;
  codes?: Array<{
    value: string;
    format?: string;
    kind?: string;
  }>;
  category?: {
    id: string;
    name: string;
  } | null;
  stock?: unknown[];
  compatibleModels?: Array<{
    modelId: string;
    yearFrom?: number | null;
    yearTo?: number | null;
  }>;
}

export interface InventoryWarranty {
  status: 'ACTIVE' | 'EXPIRED' | 'VOIDED' | 'NOT_APPLICABLE';
  startDate: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  coverage: string | null;
  voidedReason: string | null;
  openClaims: number;
}

export interface InventoryList<T> {
  data: T[];
  meta: {
    page?: number;
    limit?: number;
    total: number;
    totalPages: number;
  };
}

export interface InventoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export interface InventoryProvider {
  getVehicleByVin(vin: string): Promise<InventoryVehicle | null>;

  searchVehicles(
    query: InventoryQuery,
  ): Promise<InventoryList<InventoryVehicle>>;

  searchProducts(
    query: InventoryQuery,
  ): Promise<InventoryList<InventoryProduct>>;

  getProductByCode(code: string): Promise<InventoryProduct | null>;

  getCompatibleProducts(
    vehicleId: string,
  ): Promise<InventoryProduct[]>;

  getWarrantyByVehicleId(
    vehicleId: string,
  ): Promise<InventoryWarranty | null>;
}
