
import {
  InventoryList,
  InventoryProduct,
  InventoryProvider,
  InventoryQuery,
  InventoryVehicle,
  InventoryWarranty,
} from '../inventory.types';

export class InventoryMockProvider implements InventoryProvider {
  private readonly vehicles: InventoryVehicle[] = [
    {
      id: 'mock-vehicle-001',
      vin: 'MOCKVIN1234567890',
      brand: 'Honda',
      model: 'Cargo 150',
      year: 2025,
      color: 'Rojo',
      status: 'AVAILABLE',
      modelStock: 5,
    },
  ];

  private readonly products: InventoryProduct[] = [
    {
      id: 'mock-product-001',
      sku: 'MOCK-REF-001',
      name: 'Balatas delanteras',
      partNumber: 'BP-001',
      description: 'Balatas delanteras de demostración',
      price: 350,
      status: 'ACTIVE',
      codes: [
        {
          value: 'MOCK-REF-001',
          format: 'CODE128',
          kind: 'PRIMARY',
        },
      ],
      category: {
        id: 'mock-category-001',
        name: 'Frenos',
      },
      stock: [],
    },
  ];

  private readonly warranties: Record<string, InventoryWarranty> = {
    'mock-vehicle-001': {
      status: 'ACTIVE',
      startDate: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      daysRemaining: 39,
      coverage: 'Garantía de demostración',
      voidedReason: null,
      openClaims: 0,
    },
  };

  private paginate<T>(
    items: T[],
    query: InventoryQuery,
  ): InventoryList<T> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const total = items.length;

    return {
      data: items.slice((page - 1) * limit, page * limit),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getVehicleByVin(vin: string): Promise<InventoryVehicle | null> {
    return (
      this.vehicles.find(
        (vehicle) => vehicle.vin.toUpperCase() === vin.trim().toUpperCase(),
      ) ?? null
    );
  }

  async searchVehicles(
    query: InventoryQuery,
  ): Promise<InventoryList<InventoryVehicle>> {
    const search = query.search?.toLowerCase();

    const filtered = this.vehicles.filter((vehicle) => {
      const matchesSearch =
        !search ||
        vehicle.vin.toLowerCase().includes(search) ||
        vehicle.brand.toLowerCase().includes(search) ||
        vehicle.model.toLowerCase().includes(search);

      const matchesStatus =
        !query.status || vehicle.status === query.status;

      return matchesSearch && matchesStatus;
    });

    return this.paginate(filtered, query);
  }

  async searchProducts(
    query: InventoryQuery,
  ): Promise<InventoryList<InventoryProduct>> {
    const search = query.search?.toLowerCase();

    const filtered = this.products.filter((product) => {
      const matchesSearch =
        !search ||
        product.name.toLowerCase().includes(search) ||
        product.sku.toLowerCase().includes(search) ||
        product.partNumber?.toLowerCase().includes(search) ||
        product.codes?.some((code) =>
          code.value.toLowerCase().includes(search),
        );

      const matchesStatus =
        !query.status || product.status === query.status;

      return matchesSearch && matchesStatus;
    });

    return this.paginate(filtered, query);
  }

  async getProductByCode(code: string): Promise<InventoryProduct | null> {
    const normalizedCode = code.trim().toLowerCase();

    return (
      this.products.find(
        (product) =>
          product.sku.toLowerCase() === normalizedCode ||
          product.codes?.some(
            (item) => item.value.toLowerCase() === normalizedCode,
          ),
      ) ?? null
    );
  }

  async getCompatibleProducts(
    vehicleId: string,
  ): Promise<InventoryProduct[]> {
    const vehicle = this.vehicles.find((item) => item.id === vehicleId);

    return vehicle ? [...this.products] : [];
  }

  async getWarrantyByVehicleId(
    vehicleId: string,
  ): Promise<InventoryWarranty | null> {
    return this.warranties[vehicleId] ?? null;
  }
}
