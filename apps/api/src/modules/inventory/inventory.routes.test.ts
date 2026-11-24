import request from 'supertest';
import { env } from '../../config/env';
import { app, bearer, loginAs } from '../../test-helpers';

// Con INVENTORY_PROVIDER=http el router llamaría al servicio real:
// estos tests se saltan para no depender de la API de Inventario corriendo.
const describeInventory = env.inventoryProvider === 'http' ? describe.skip : describe;

describeInventory('Integración Inventario · rutas /inventory (contrato v1.0)', () => {
  let technicianToken: string;
  let advisorToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    technicianToken = await loginAs('technician@company.com');
    advisorToken = await loginAs('advisor@company.com');
    employeeToken = await loginAs('employee@company.com');
  });

  it('rechaza sin sesión (401)', async () => {
    const res = await request(app).get('/api/v1/inventory/products');
    expect(res.status).toBe(401);
  });

  it('rechaza a Employee sin INVENTORY_READ (403)', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/products')
      .set(bearer(employeeToken));
    expect(res.status).toBe(403);
  });

  it('lista refacciones para Technician, sin price (§4)', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/products')
      .set(bearer(technicianToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).not.toHaveProperty('price');
    expect(res.body.meta).toHaveProperty('total');
  });

  it('busca moto por VIN y normaliza a mayúsculas (§10)', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/vehicles/by-vin/md2a1aax5rwa00004')
      .set(bearer(technicianToken));
    expect(res.status).toBe(200);
    expect(res.body.data.vin).toBe('MD2A1AAX5RWA00004');
  });

  it('rechaza VIN inválido (400 VALIDATION_ERROR)', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/vehicles/by-vin/123')
      .set(bearer(technicianToken));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve stock con niveles calculados (§4)', async () => {
    const products = await request(app)
      .get('/api/v1/inventory/products')
      .set(bearer(technicianToken));
    const id: string = products.body.data[0].id;
    const res = await request(app)
      .get(`/api/v1/inventory/products/${id}/stock`)
      .set(bearer(technicianToken));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(0);
    for (const loc of res.body.data.locations) {
      expect(['AVAILABLE', 'LOW', 'OUT']).toContain(loc.level);
    }
  });

  it('lista modelos para Service Advisor (200)', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/vehicle-models')
      .set(bearer(advisorToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});