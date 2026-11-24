import { computeStockLevel } from './inventory.types';
import {
  productSchema,
  stockResponseSchema,
  vehicleSchema,
  vinSchema,
  warrantySchema,
} from './inventory.schemas';

const vehicle = {
  id: 'f3aa1bda-b3d4-4300-958a-3b5cffa2f1f1',
  vin: 'MD2A1AAX5RWA00004',
  brand: 'Marca Demo',
  model: 'Modelo 150',
  modelId: 'b8fe35fc-65fa-41ac-a987-4da05383b074',
  year: 2023,
  status: 'SOLD',
  locationId: '11111111-1111-4111-8111-111111111111',
  modelStock: 2,
  // Campos que el contrato manda ocultar (§4): deben descartarse.
  price: '189000.00',
  cost: '150000.00',
  soldAt: '2026-01-15T10:00:00.000Z',
  customerName: 'Cliente Ejemplo',
  customerPhone: '6000000000',
  coverage: '12 meses',
};

describe('inventory adapter (contrato v1.0)', () => {
  it('descarta price, cost y datos de cliente del vehículo (§4)', () => {
    const parsed = vehicleSchema.parse(vehicle);
    expect(parsed).not.toHaveProperty('price');
    expect(parsed).not.toHaveProperty('cost');
    expect(parsed).not.toHaveProperty('customerName');
    expect(parsed.vin).toBe('MD2A1AAX5RWA00004');
  });

  it('calcula el nivel de stock con umbral 5 (§4)', () => {
    expect(computeStockLevel(0, 5)).toBe('OUT');
    expect(computeStockLevel(4, 5)).toBe('LOW');
    expect(computeStockLevel(5, 5)).toBe('AVAILABLE');
    expect(computeStockLevel(120, 5)).toBe('AVAILABLE');
  });

  it('normaliza y valida el VIN (§10)', () => {
    expect(vinSchema.parse('md2a1aax5rwa00004')).toBe('MD2A1AAX5RWA00004');
    expect(() => vinSchema.parse('MD2A1AAX5RWA0000')).toThrow();
    expect(() => vinSchema.parse('IOQ2A1AAX5RWA0004')).toThrow();
  });

  it('rechaza respuestas fuera de contrato (→ INVENTORY_CONTRACT_MISMATCH)', () => {
    expect(() => warrantySchema.parse({ status: 'ACTIVE' })).toThrow();
    expect(() => productSchema.parse({ id: 'no-uuid', sku: 'X' })).toThrow();
  });

  it('acepta el stock real con ubicaciones (§4)', () => {
    const parsed = stockResponseSchema.parse({
      productId: '7a046a5a-d160-4938-aa29-b06f84ab1dec',
      total: 8,
      locations: [
        {
          quantity: 8,
          location: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'MAIN',
            code: 'MAIN',
            type: 'ALMACEN',
          },
        },
      ],
    });
    expect(parsed.locations[0]?.location.name).toBe('MAIN');
  });
});