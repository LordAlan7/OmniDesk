import { redactSensitive, safeErrorLog } from './redact';

describe('redact: datos de inventario (paso 13)', () => {
  it('oculta credencial, VIN y datos de cliente por nombre de clave', () => {
    const out = redactSensitive({
      inventoryApiCredential: 'abc',
      INVENTORY_API_CREDENTIAL: 'abc',
      vin: 'MD2A1AAX5RWA00004',
      vehicleVin: 'MD2A1AAX5RWA00004',
      vehicle_vin: 'MD2A1AAX5RWA00004',
      customerName: 'Cliente',
      customerPhone: '5551234567',
      nested: { vin: 'MD2A1AAX5RWA00004' },
    });
    expect(JSON.stringify(out)).not.toContain('MD2A1AAX5RWA00004');
    expect(JSON.stringify(out)).not.toContain('abc');
    expect(JSON.stringify(out)).not.toContain('Cliente');
    expect(JSON.stringify(out)).not.toContain('5551234567');
  });

  it('no oculta claves inofensivas que contienen "vin"', () => {
    expect(redactSensitive({ province: 'Durango', email: 'a@b.c' })).toEqual({
      province: 'Durango',
      email: 'a@b.c',
    });
  });

  it('safeErrorLog oculta un VIN dentro del mensaje y del stack', () => {
    const err = new Error('falló /vehicles/by-vin/MD2A1AAX5RWA00004');
    const log = safeErrorLog(err);
    expect(JSON.stringify(log)).not.toContain('MD2A1AAX5RWA00004');
    expect(log.message).toContain('[VIN]');
  });
});