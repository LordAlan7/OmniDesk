import { env } from '../../../config/env';
import { Errors } from '../../../shared/errors';
import {
  InventoryProvider,
  InventoryVehicle,
  InventoryVehicleEvent,
  InventoryWarranty,
  InventoryProduct,
  InventoryCompatibleProduct,
  InventoryVehicleModel,
  InventoryProductFilters,
  InventoryListMeta,
  InventoryStock,
  VehicleStatus,
  VehicleEventType,
  StockLevel,
} from '../inventory.types';

type JsonObject = Record<string, unknown>;

export class InventoryHttpProvider implements InventoryProvider {
  private readonly baseUrl: string;
  private readonly credential: string;
  private readonly timeoutMs = 8000;

  constructor() {
    this.baseUrl = (env.inventoryApiUrl ?? 'http://localhost:3001').replace(/\/+$/, '');
    this.credential = env.inventoryApiCredential ?? '';

    if (!this.credential) {
      throw new Error('INVENTORY_API_CREDENTIAL is not configured.');
    }
  }

  private async request<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
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

      if (!response.ok) {
        throw Errors.badGateway();
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw Errors.badGateway();
      }
      if (typeof error === 'object' && error !== null && 'status' in error) {
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
    const v = this.asObject(value);
    return {
      id: String(v.id),
      vin: String(v.vin),
      brand: String(v.brand),
      model: String(v.model),
      modelId: v.modelId == null ? null : String(v.modelId),
      year: Number(v.year),
      status: String(v.status) as VehicleStatus,
      locationId: String(v.locationId),
      modelStock: Number(v.modelStock ?? 0),
    };
  }

  private mapProduct(value: unknown): InventoryProduct {
    const p = this.asObject(value);
    const category =
      typeof p.category === 'object' && p.category !== null
        ? this.asObject(p.category)
        : null;

    return {
      id: String(p.id),
      sku: String(p.sku),
      name: String(p.name),
      brand: p.brand == null ? null : String(p.brand),
      category: category
        ? { id: String(category.id), name: String(category.name) }
        : null,
      status: String(p.status),
      codes: Array.isArray(p.codes)
        ? p.codes.map((c) => {
            const code = this.asObject(c);
            return {
              value: String(code.value),
              format: code.format == null ? null : String(code.format),
              kind: code.kind == null ? null : String(code.kind),
            };
          })
        : [],
    };
  }

  private mapListMeta(value: unknown, fallbackLength: number): InventoryListMeta {
    const m = this.asObject(value ?? {});
    return {
      page: typeof m.page === 'number' ? m.page : undefined,
      limit: typeof m.limit === 'number' ? m.limit : undefined,
      total: Number(m.total ?? fallbackLength),
      totalPages: typeof m.totalPages === 'number' ? m.totalPages : undefined,
    };
  }

  async getVehicleByVin(vin: string): Promise<InventoryVehicle> {
    const result = await this.request<unknown>(
      `/vehicles/by-vin/${encodeURIComponent(vin)}`,
    );
    return this.mapVehicle(result);
  }

  async getVehicleById(id: string): Promise<InventoryVehicle> {
    const result = await this.request<unknown>(
      `/vehicles/${encodeURIComponent(id)}`,
    );
    return this.mapVehicle(result);
  }

  async getVehicleEvents(id: string): Promise<InventoryVehicleEvent[]> {
    const result = await this.request<unknown>(
      `/vehicles/${encodeURIComponent(id)}/events`,
    );
    const obj = this.asObject(result);
    const data = Array.isArray(obj.data) ? obj.data : [];
    return data.map((e) => {
      const ev = this.asObject(e);
      return {
        id: String(ev.id),
        type: String(ev.type) as VehicleEventType,
        occurredAt: String(ev.occurredAt),
        locationId: ev.locationId == null ? null : String(ev.locationId),
      };
    });
  }

  async getVehicleWarranty(id: string): Promise<InventoryWarranty> {
    const result = await this.request<unknown>(
      `/vehicles/${encodeURIComponent(id)}/warranty`,
    );
    const w = this.asObject(result);
    return {
      status: String(w.status) as InventoryWarranty['status'],
      startDate: w.startDate == null ? null : String(w.startDate),
      expiresAt: w.expiresAt == null ? null : String(w.expiresAt),
      daysRemaining: typeof w.daysRemaining === 'number' ? w.daysRemaining : null,
      coverage: w.coverage == null ? null : String(w.coverage),
      voidedReason: w.voidedReason == null ? null : String(w.voidedReason),
      openClaims: Number(w.openClaims ?? 0),
    };
  }

  async getCompatibleProducts(id: string): Promise<InventoryCompatibleProduct[]> {
    const result = await this.request<unknown>(
      `/vehicles/${encodeURIComponent(id)}/compatible-products`,
    );
    const obj = this.asObject(result);
    const data = Array.isArray(obj.data) ? obj.data : [];
    return data.map((item) => {
      const p = this.mapProduct(item);
      const stockTotal = Number((item as any).stockTotal ?? 0);
      const stockLevel = String((item as any).stockLevel ?? 'OUT') as StockLevel;
      return { ...p, stockTotal, stockLevel };
    });
  }

  async listProducts(
    filters?: InventoryProductFilters,
  ): Promise<{ data: InventoryProduct[]; meta: InventoryListMeta }> {
    const result = await this.request<unknown>('/products', {
      q: filters?.search,
      categoryId: filters?.categoryId,
      page: filters?.page,
      limit: filters?.limit,
    });
    const obj = this.asObject(result);
    const data = Array.isArray(obj.data) ? obj.data.map((p) => this.mapProduct(p)) : [];
    return { data, meta: this.mapListMeta(obj.meta, data.length) };
  }

  async getProductByCode(value: string): Promise<InventoryProduct> {
    const result = await this.request<unknown>(
      `/products/by-code/${encodeURIComponent(value)}`,
    );
    return this.mapProduct(result);
  }

  async getProductById(id: string): Promise<InventoryProduct> {
    const result = await this.request<unknown>(
      `/products/${encodeURIComponent(id)}`,
    );
    return this.mapProduct(result);
  }

  async getProductStock(id: string): Promise<InventoryStock> {
    const result = await this.request<unknown>(
      `/products/${encodeURIComponent(id)}/stock`,
    );
    const s = this.asObject(result);
    return {
      productId: String(s.productId),
      total: Number(s.total ?? 0),
      locations: Array.isArray(s.locations)
        ? s.locations.map((l) => {
            const loc = this.asObject(l);
            const location = this.asObject(loc.location);
            return {
              location: {
                id: String(location.id),
                name: String(location.name),
                code: location.code == null ? undefined : String(location.code),
                type: location.type == null ? undefined : String(location.type),
              },
              quantity: Number(loc.quantity ?? 0),
              level: String(loc.level ?? 'OUT') as StockLevel,
            };
          })
        : [],
    };
  }

  async listVehicleModels(): Promise<InventoryVehicleModel[]> {
    const result = await this.request<unknown>('/vehicle-models');
    const obj = this.asObject(result);
    const data = Array.isArray(obj.data) ? obj.data : [];
    return data.map((m) => {
      const model = this.asObject(m);
      return {
        id: String(model.id),
        brand: String(model.brand),
        model: String(model.model),
        yearFrom: typeof model.yearFrom === 'number' ? model.yearFrom : null,
        yearTo: typeof model.yearTo === 'number' ? model.yearTo : null,
        engineCc: typeof model.engineCc === 'number' ? model.engineCc : null,
        status: String(model.status),
      };
    });
  }

  async getVehicleModelById(id: string): Promise<InventoryVehicleModel> {
    const result = await this.request<unknown>(
      `/vehicle-models/${encodeURIComponent(id)}`,
    );
    const m = this.asObject(result);
    return {
      id: String(m.id),
      brand: String(m.brand),
      model: String(m.model),
      yearFrom: typeof m.yearFrom === 'number' ? m.yearFrom : null,
      yearTo: typeof m.yearTo === 'number' ? m.yearTo : null,
      engineCc: typeof m.engineCc === 'number' ? m.engineCc : null,
      status: String(m.status),
    };
  }
}