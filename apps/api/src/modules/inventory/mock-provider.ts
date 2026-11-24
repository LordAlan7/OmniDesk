import { Errors } from '../../shared/errors';
import { InventoryErrors } from './inventory-errors';
import { uuidSchema, vinSchema } from './inventory.schemas';
import {
  computeStockLevel,
  type InventoryCompatibleProduct,
  type InventoryListMeta,
  type InventoryProduct,
  type InventoryProductFilters,
  type InventoryProvider,
  type InventoryStock,
  type InventoryVehicle,
  type InventoryVehicleEvent,
  type InventoryVehicleModel,
  type InventoryWarranty,
} from './inventory.types';

/** Proveedor en memoria (INVENTORY_PROVIDER=mock) para desarrollo y pruebas. */

const MOCK_LOW_STOCK_THRESHOLD = 5;

const LOC_MAIN = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Almacén Principal',
  code: 'MAIN',
  type: 'ALMACEN',
};
const LOC_TALLER = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Taller',
  code: 'TALLER',
  type: 'TALLER',
};

const models: InventoryVehicleModel[] = [
  { id: 'b8fe35fc-65fa-41ac-a987-4da05383b074', brand: 'Marca Demo', model: 'Modelo 150', yearFrom: 2020, yearTo: 2026, engineCc: 150, status: 'ACTIVE' },
  { id: 'ca4edea5-6bf2-4ed2-b8c7-92db39aefae6', brand: 'Marca Demo', model: 'Modelo 200', yearFrom: 2022, yearTo: 2026, engineCc: 200, status: 'ACTIVE' },
];

const vehicles: InventoryVehicle[] = [
  { id: 'f3aa1bda-b3d4-4300-958a-3b5cffa2f1f1', vin: 'MD2A1AAX5RWA00004', brand: 'Marca Demo', model: 'Modelo 150', modelId: models[0]!.id, year: 2023, status: 'SOLD', locationId: LOC_MAIN.id, modelStock: 1 },
  { id: 'a1b2c3d4-e5f6-4789-8901-234567890123', vin: 'MD2A1AAX5RWA00011', brand: 'Marca Demo', model: 'Modelo 200', modelId: models[1]!.id, year: 2024, status: 'IN_STOCK', locationId: LOC_MAIN.id, modelStock: 1 },
];

interface MockProductRow {
  product: InventoryProduct;
  stock: { locationId: string; quantity: number }[];
  compatibleModelIds: string[];
}

const productRows: MockProductRow[] = [
  {
    product: {
      id: '7a046a5a-d160-4938-aa29-b06f84ab1dec',
      sku: 'FIL-ACE-150',
      name: 'Filtro de aceite',
      brand: 'Marca Demo',
      category: { id: '33333333-3333-4333-8333-333333333333', name: 'Filtros' },
      status: 'ACTIVE',
      codes: [{ value: '75123134', format: 'EAN13', kind: 'PRIMARY' }],
    },
    stock: [
      { locationId: LOC_MAIN.id, quantity: 12 },
      { locationId: LOC_TALLER.id, quantity: 3 },
    ],
    compatibleModelIds: [models[0]!.id, models[1]!.id],
  },
  {
    product: {
      id: '8b156b6b-e271-4a49-8b3a-c17f95bc2efd',
      sku: 'BAT-12V-9A',
      name: 'Batería 12V 9Ah',
      brand: 'Marca Demo',
      category: { id: '44444444-4444-4444-8444-444444444444', name: 'Baterías' },
      status: 'ACTIVE',
      codes: [{ value: '75123135', format: 'EAN13', kind: 'PRIMARY' }],
    },
    stock: [{ locationId: LOC_MAIN.id, quantity: 0 }],
    compatibleModelIds: [models[1]!.id],
  },
  {
    product: {
      id: '9c267c7c-f382-4b5a-9c4b-d28a06cd3f0e',
      sku: 'LLA-FRE-STD',
      name: 'Pastilla de freno',
      brand: 'Marca Demo',
      category: { id: '55555555-5555-4555-8555-555555555555', name: 'Frenos' },
      status: 'ACTIVE',
      codes: [{ value: '75123136', format: 'EAN13', kind: 'PRIMARY' }],
    },
    stock: [{ locationId: LOC_MAIN.id, quantity: 40 }],
    compatibleModelIds: [models[0]!.id],
  },
];

const eventsByVehicle: Record<string, InventoryVehicleEvent[]> = {
  [vehicles[0]!.id]: [
    { id: '0f8e7d6c-c5b4-4a93-9122-d1a0b1c2d3e4', type: 'ENTRY', occurredAt: '2026-09-01T10:00:00.000Z', locationId: LOC_MAIN.id },
    { id: '1a9f8e7d-d6c5-4b04-8233-e2b1c2d3e4f5', type: 'SALE', occurredAt: '2026-09-20T16:30:00.000Z', locationId: LOC_MAIN.id },
  ],
  [vehicles[1]!.id]: [
    { id: '2b0f9f8e-e7d6-4c15-9344-f3c2d3e4f5a6', type: 'ENTRY', occurredAt: '2026-10-02T09:15:00.000Z', locationId: LOC_MAIN.id },
  ],
};

const warrantyByVehicle: Record<string, InventoryWarranty> = {
  [vehicles[0]!.id]: {
    status: 'ACTIVE',
    startDate: '2026-09-20T16:30:00.000Z',
    expiresAt: '2027-09-20T16:30:00.000Z',
    daysRemaining: 300,
    coverage: '12 meses',
    voidedReason: null,
    openClaims: 1,
  },
  [vehicles[1]!.id]: {
    status: 'NOT_APPLICABLE',
    startDate: null,
    expiresAt: null,
    daysRemaining: null,
    coverage: null,
    voidedReason: null,
    openClaims: 0,
  },
};

function invalid(field: string): never {
  throw Errors.validation([{ field, message: `Campo inválido: ${field}.` }]);
}

export class MockInventoryProvider implements InventoryProvider {
  private vehicle(vehicle: InventoryVehicle | undefined): InventoryVehicle {
    if (!vehicle) throw InventoryErrors.notFound('La motocicleta');
    return { ...vehicle };
  }

  private row(productId: string): MockProductRow {
    const row = productRows.find((r) => r.product.id === productId);
    if (!row) throw InventoryErrors.notFound('La refacción');
    return row;
  }

  async getVehicleByVin(vin: string): Promise<InventoryVehicle> {
    const check = vinSchema.safeParse(vin);
    if (!check.success) invalid('vin');
    return this.vehicle(vehicles.find((v) => v.vin === check.data));
  }

  async getVehicleById(id: string): Promise<InventoryVehicle> {
    if (!uuidSchema.safeParse(id).success) invalid('id');
    return this.vehicle(vehicles.find((v) => v.id === id));
  }

  async getVehicleEvents(id: string): Promise<InventoryVehicleEvent[]> {
    if (!uuidSchema.safeParse(id).success) invalid('id');
    const events = eventsByVehicle[id];
    if (!events) throw InventoryErrors.notFound('La motocicleta');
    return events.map((e) => ({ ...e }));
  }

  async getVehicleWarranty(id: string): Promise<InventoryWarranty> {
    if (!uuidSchema.safeParse(id).success) invalid('id');
    const warranty = warrantyByVehicle[id];
    if (!warranty) throw InventoryErrors.notFound('La motocicleta');
    return { ...warranty };
  }

  async getCompatibleProducts(id: string): Promise<InventoryCompatibleProduct[]> {
    if (!uuidSchema.safeParse(id).success) invalid('id');
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) throw InventoryErrors.notFound('La motocicleta');
    return productRows
      .filter((row) => vehicle.modelId && row.compatibleModelIds.includes(vehicle.modelId))
      .map((row) => this.withStock(row));
  }

  async listProducts(
    filters: InventoryProductFilters = {},
  ): Promise<{ data: InventoryProduct[]; meta: InventoryListMeta }> {
    const search = filters.search?.toLowerCase();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const filtered = productRows.filter((row) => {
      if (filters.categoryId && row.product.category?.id !== filters.categoryId) return false;
      if (!search) return true;
      return (
        row.product.name.toLowerCase().includes(search) ||
        row.product.sku.toLowerCase().includes(search)
      );
    });
    const start = (page - 1) * limit;
    return {
      data: filtered.slice(start, start + limit).map((row) => ({ ...row.product })),
      meta: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
    };
  }

  async getProductByCode(value: string): Promise<InventoryProduct> {
    const code = value.trim();
    const row = productRows.find((r) => r.product.codes.some((c) => c.value === code));
    if (!row) throw InventoryErrors.notFound('La refacción');
    return { ...row.product };
  }

  async getProductById(id: string): Promise<InventoryProduct> {
    if (!uuidSchema.safeParse(id).success) invalid('id');
    return { ...this.row(id).product };
  }

  async getProductStock(id: string): Promise<InventoryStock> {
    if (!uuidSchema.safeParse(id).success) invalid('id');
    const row = this.row(id);
    const locations = row.stock.map((s) => {
      const location = s.locationId === LOC_TALLER.id ? LOC_TALLER : LOC_MAIN;
      return {
        location: { ...location },
        quantity: s.quantity,
        level: computeStockLevel(s.quantity, MOCK_LOW_STOCK_THRESHOLD),
      };
    });
    return {
      productId: row.product.id,
      total: row.stock.reduce((sum, s) => sum + s.quantity, 0),
      locations,
    };
  }

  async listVehicleModels(): Promise<InventoryVehicleModel[]> {
    return models.map((m) => ({ ...m }));
  }

  async getVehicleModelById(id: string): Promise<InventoryVehicleModel> {
    if (!uuidSchema.safeParse(id).success) invalid('id');
    const model = models.find((m) => m.id === id);
    if (!model) throw InventoryErrors.notFound('El modelo');
    return { ...model };
  }

  private withStock(row: MockProductRow): InventoryCompatibleProduct {
    const stockTotal = row.stock.reduce((sum, s) => sum + s.quantity, 0);
    return {
      ...row.product,
      codes: row.product.codes.map((c) => ({ ...c })),
      stockTotal,
      stockLevel: computeStockLevel(stockTotal, MOCK_LOW_STOCK_THRESHOLD),
    };
  }
}