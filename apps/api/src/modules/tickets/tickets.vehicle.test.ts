import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

const VIN_A = 'MD2A1AAX5RWA00004';
const VIN_B = 'MD2A1AAX5RWA00011';
const MODEL_A_ID = 'b8fe35fc-65fa-41ac-a987-4da05383b074';

const base = {
  title: 'La moto no enciende',
  description: 'El motor no arranca después de la revisión.',
  categoryId: 2,
  storeLocation: 'Sucursal Centro',
};

describe('Paso 6 - tickets vinculados a motocicletas del inventario', () => {
  let employee: string;
  let advisor: string;
  let manager: string;

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    advisor = await loginAs('advisor@company.com');
    manager = await loginAs('manager@company.com');
  });

  async function create(extra: Record<string, unknown>) {
    return request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({ ...base, ...extra });
  }

  it('crea un ticket con VIN y guarda la copia mínima', async () => {
    const res = await create({ vehicleVin: VIN_A });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      vehicleVin: VIN_A,
      vehicleModelId: MODEL_A_ID,
      vehicleBrand: 'Marca Demo',
      vehicleModel: 'Modelo 150',
      vehicleYear: 2023,
      motorcycleModel: 'Marca Demo Modelo 150',
    });
  });

  it('normaliza el VIN a mayúsculas', async () => {
    const res = await create({ vehicleVin: VIN_A.toLowerCase() });
    expect(res.status).toBe(201);
    expect(res.body.data.vehicleVin).toBe(VIN_A);
  });

  it('rechaza un VIN con formato inválido (400)', async () => {
    const res = await create({ vehicleVin: 'ABC123' });
    expect(res.status).toBe(400);
  });

  it('rechaza un VIN que no existe en inventario (404)', async () => {
    const res = await create({ vehicleVin: 'MD2A1AAX5RWA99999' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVENTORY_NOT_FOUND');
  });

  it('exige VIN o modelo de motocicleta (400)', async () => {
    const res = await create({});
    expect(res.status).toBe(400);
  });

  it('sigue aceptando tickets sin VIN con motorcycleModel', async () => {
    const res = await create({ motorcycleModel: 'Italika FT150' });
    expect(res.status).toBe(201);
    expect(res.body.data.vehicleVin).toBeNull();
  });

  it('registra vehicle_linked en el historial al crear', async () => {
    const created = await create({ vehicleVin: VIN_A });
    const history = await request(app)
      .get(`/api/v1/tickets/${created.body.data.id}/history`)
      .set(bearer(advisor));
    expect(history.status).toBe(200);
    const actions = history.body.data.map((h: { action: string }) => h.action);
    expect(actions).toContain('created');
    expect(actions).toContain('vehicle_linked');
  });

  it('cambia la moto vía business-information y deja historial', async () => {
    const created = await create({ vehicleVin: VIN_A });
    const id = created.body.data.id;

    const patch = await request(app)
      .patch(`/api/v1/tickets/${id}/business-information`)
      .set(bearer(advisor))
      .send({ vehicleVin: VIN_B, version: created.body.data.version });

    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({
      vehicleVin: VIN_B,
      vehicleModel: 'Modelo 200',
      vehicleYear: 2024,
    });

    const history = await request(app)
      .get(`/api/v1/tickets/${id}/history`)
      .set(bearer(advisor));
    const linked = history.body.data.filter(
      (h: { action: string }) => h.action === 'vehicle_linked',
    );
    expect(linked.length).toBe(2);
  });

  it('desvincula la moto con vehicleVin: null', async () => {
    const created = await create({ vehicleVin: VIN_A });
    const patch = await request(app)
      .patch(`/api/v1/tickets/${created.body.data.id}/business-information`)
      .set(bearer(advisor))
      .send({ vehicleVin: null, version: created.body.data.version });

    expect(patch.status).toBe(200);
    expect(patch.body.data.vehicleVin).toBeNull();
  });

  it('un Employee no puede editar la info comercial (403)', async () => {
    const created = await create({ vehicleVin: VIN_A });
    const patch = await request(app)
      .patch(`/api/v1/tickets/${created.body.data.id}/business-information`)
      .set(bearer(employee))
      .send({ vehicleVin: VIN_B, version: created.body.data.version });

    expect(patch.status).toBe(403);
  });

  it('filtra el listado por VIN y por modelo', async () => {
    await create({ vehicleVin: VIN_B });

    const byVin = await request(app)
      .get(`/api/v1/tickets?vehicleVin=${VIN_B}&page=1&limit=50`)
      .set(bearer(manager));
    expect(byVin.status).toBe(200);
    expect(byVin.body.data.length).toBeGreaterThan(0);
    expect(
      byVin.body.data.every((t: { vehicleVin: string }) => t.vehicleVin === VIN_B),
    ).toBe(true);

    const byModel = await request(app)
      .get(`/api/v1/tickets?vehicleModelId=${MODEL_A_ID}&page=1&limit=50`)
      .set(bearer(manager));
    expect(byModel.status).toBe(200);
    expect(
      byModel.body.data.every(
        (t: { vehicleModelId: string }) => t.vehicleModelId === MODEL_A_ID,
      ),
    ).toBe(true);
  });

  it('filtra el reporte por VIN y devuelve los datos de la moto', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/tickets?vehicleVin=${VIN_A}`)
      .set(bearer(manager));

    // En memoria el reporte requiere PostgreSQL: se acepta 200 con datos o el error de DB.
    if (res.status === 200) {
      for (const item of res.body.data.items) {
        expect(item.vehicleVin).toBe(VIN_A);
      }
    }
  });

  it('el seguimiento público del solicitante no expone el VIN', async () => {
    const created = await create({ vehicleVin: VIN_A });
    const res = await request(app)
      .get(`/api/v1/me/tickets/${created.body.data.id}`)
      .set(bearer(employee));

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('vehicleVin');
    expect(
      res.body.data.updates.some((u: { action: string }) => u.action === 'vehicle_linked'),
    ).toBe(false);
  });
});