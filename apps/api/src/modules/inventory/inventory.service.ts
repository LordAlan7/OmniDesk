
import { env } from '../../config/env';
import {
  InventoryList,
  InventoryProduct,
  InventoryProvider,
  InventoryQuery,
  InventoryVehicle,
  InventoryWarranty,
} from './inventory.types';
import { InventoryHttpProvider } from './providers/inventory-http.provider';
import { InventoryMockProvider } from './providers/inventory-mock.provider';

export class InventoryService {
  private readonly provider: InventoryProvider;

  constructor(provider?: InventoryProvider) {
    this.provider =
      provider ??
      (env.nodeEnv === 'test'
        ? new InventoryMockProvider()
        : new InventoryHttpProvider());
  }

  getVehicleByVin(vin: string): Promise<InventoryVehicle | null> {
    return this.provider.getVehicleByVin(vin);
  }

  searchVehicles(
    query: InventoryQuery,
  ): Promise<InventoryList<InventoryVehicle>> {
    return this.provider.searchVehicles(query);
  }

  searchProducts(
    query: InventoryQuery,
  ): Promise<InventoryList<InventoryProduct>> {
    return this.provider.searchProducts(query);
  }

  getProductByCode(code: string): Promise<InventoryProduct | null> {
    return this.provider.getProductByCode(code);
  }

  getCompatibleProducts(vehicleId: string): Promise<InventoryProduct[]> {
    return this.provider.getCompatibleProducts(vehicleId);
  }

  getWarrantyByVehicleId(
    vehicleId: string,
  ): Promise<InventoryWarranty | null> {
    return this.provider.getWarrantyByVehicleId(vehicleId);
  }
}
