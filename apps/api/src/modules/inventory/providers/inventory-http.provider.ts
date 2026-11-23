
import { env } from '../../../config/env';
import { Errors } from '../../../shared/errors';
import {
  InventoryList,
  InventoryProduct,
  InventoryProvider,
  InventoryQuery,
  InventoryVehicle,
  InventoryWarranty,
} from '../inventory.types';

type JsonObject = Record<string, unknown>;

export class InventoryHttpProvider implements InventoryProvider {
  private readonly baseUrl: string;
  private readonly credential: string;
  private readonly timeoutMs = 8000;

  constructor() {
    this.baseUrl = env.inventoryApiUrl.replace(/\/+$/, '');
    this.credential = env.inventoryApiCredential ?? '';

    if (!this.credential) {
      throw new Error('INVENTORY_API_CREDENTIAL is not configured.');
    }
  }

  private async request<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
    allowNotFound = false,
  ): Promise<T | null> {
    const url = new URL(`${this.baseUrl}${path}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Device ${this.credential}`,
        },
        signal: controller.signal,
      });

      if (allowNotFound && response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw Errors.badGateway();
      }

      return (await response.json()) as T;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'AbortError'
      ) {
        throw Errors.badGateway();
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error
      ) {
        throw error;
      }

      throw Errors.badGateway();
    } finally {
      clearTimeout(timeout);
    }
  }

  private asObject(value: unknown): JsonObject {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw Errors.badGateway();
    }

    return value as JsonObject;
  }

  private mapVehicle(value: unknown): InventoryVehicle {
    const vehicle = this.asObject(value);

    return {
      id: String(vehicle.id),
      vin: String(vehicle.vin),
      brand: String(vehicle.brand),
      model: String(vehicle.model),
      year: Number(vehicle.year),
      color: vehicle.color == null ? null : String(vehicle.color),
      status: String(vehicle.status),
      modelStock:
        typeof vehicle.modelStock === 'number'
          ? vehicle.modelStock
          : undefined,
    };
  }

  private mapProduct(value: unknown): InventoryProduct {
    const product = this.asObject(value);

    const category =
      typeof product.category === 'object' && product.category !== null
        ? product.category as JsonObject
        : null;

    return {
      id: String(product.id),
      sku: String(product.sku),
      name: String(product.name),
      brand: product.brand == null ? null : String(product.brand),
      partNumber: product.partNumber == null ? null : String(product.partNumber),
      description: product.description == null ? null : String(product.description),
      price: product.price == null ? null : Number(product.price),
      status: String(product.status),

      codes: Array.isArray(product.codes)
        ? product.codes.map((item) => {
            const code = this.asObject(item);

            return {
              value: String(code.value),
              format: code.format == null ? undefined : String(code.format),
              kind: code.kind == null ? undefined : String(code.kind),
            };
          })
        : [],

      category: category
        ? {
            id: String(category.id),
            name: String(category.name),
          }
        : null,

      stock: Array.isArray(product.stock) ? product.stock : [],

      compatibleModels: Array.isArray(product.compatibleModels)
        ? product.compatibleModels.map((item) => {
            const compatibility = this.asObject(item);

            return {
              modelId: String(compatibility.modelId),
              yearFrom:
                typeof compatibility.yearFrom === 'number'
                  ? compatibility.yearFrom
                  : null,
              yearTo:
                typeof compatibility.yearTo === 'number'
                  ? compatibility.yearTo
                  : null,
            };
          })
        : [],
    };
  }

  private mapList<T>(
    value: unknown,
    mapper: (item: unknown) => T,
  ): InventoryList<T> {
    const result = this.asObject(value);
    const meta = this.asObject(result.meta);

    if (!Array.isArray(result.data)) {
      throw Errors.badGateway();
    }

    return {
      data: result.data.map(mapper),
      meta: {
        page: typeof meta.page === 'number' ? meta.page : undefined,
        limit: typeof meta.limit === 'number' ? meta.limit : undefined,
        total: Number(meta.total ?? result.data.length),
        totalPages: Number(meta.totalPages ?? 1),
      },
    };
  }

  async getVehicleByVin(vin: string): Promise<InventoryVehicle | null> {
    const result = await this.request<unknown>(
      `/vehicles/by-vin/${encodeURIComponent(vin)}`,
      undefined,
      true,
    );

    return result === null ? null : this.mapVehicle(result);
  }

  async searchVehicles(
    query: InventoryQuery,
  ): Promise<InventoryList<InventoryVehicle>> {
    const result = await this.request<unknown>('/vehicles', {
      q: query.search,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });

    return this.mapList(result, (item) => this.mapVehicle(item));
  }

  async searchProducts(
    query: InventoryQuery,
  ): Promise<InventoryList<InventoryProduct>> {
    const result = await this.request<unknown>('/products', {
      q: query.search,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });

    return this.mapList(result, (item) => this.mapProduct(item));
  }

  async getProductByCode(code: string): Promise<InventoryProduct | null> {
    const result = await this.request<unknown>(
      `/products/by-code/${encodeURIComponent(code)}`,
      undefined,
      true,
    );

    return result === null ? null : this.mapProduct(result);
  }

  async getCompatibleProducts(vehicleId: string): Promise<InventoryProduct[]> {
    const result = await this.request<unknown>(
      `/vehicles/${encodeURIComponent(vehicleId)}/compatible-products`,
    );

    const response = this.asObject(result);

    if (!Array.isArray(response.data)) {
      throw Errors.badGateway();
    }

    return response.data.map((item) => this.mapProduct(item));
  }

  async getWarrantyByVehicleId(
    vehicleId: string,
  ): Promise<InventoryWarranty | null> {
    const result = await this.request<unknown>(
      `/vehicles/${encodeURIComponent(vehicleId)}/warranty`,
      undefined,
      true,
    );

    if (result === null) {
      return null;
    }

    const warranty = this.asObject(result);

    return {
      status: String(warranty.status) as InventoryWarranty['status'],
      startDate:
        warranty.startDate == null ? null : String(warranty.startDate),
      expiresAt:
        warranty.expiresAt == null ? null : String(warranty.expiresAt),
      daysRemaining:
        typeof warranty.daysRemaining === 'number'
          ? warranty.daysRemaining
          : null,
      coverage:
        warranty.coverage == null ? null : String(warranty.coverage),
      voidedReason:
        warranty.voidedReason == null
          ? null
          : String(warranty.voidedReason),
      openClaims: Number(warranty.openClaims ?? 0),
    };
  }
}
