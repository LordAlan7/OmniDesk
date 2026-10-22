import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';
import { ticketsRepository } from './tickets.repository';

describe('FR-018 requester tracking', () => {
  let employee: string;
  let other: string;
  let id: number;
  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    other = await loginAs('admin@company.com');
    const response = await request(app).post('/api/v1/tickets').set(bearer(employee)).send({
      title: 'Seguimiento privado FR018', description: 'No puedo iniciar sesión.', categoryId: 2,
      storeLocation: 'Centro', motorcycleModel: 'FT150',
    });
    expect(response.status).toBe(201);
    id = response.body.data.id;
    const ticket = await ticketsRepository.findById(id);
    if (!ticket) throw new Error('No se encontró el ticket de prueba.');
    await ticketsRepository.saveWithHistory(ticket, ticket.version, [
      { actorId: ticket.createdBy, action: 'internal_note', to: 'SECRETO FR018' },
    ]);
  });
  it('requires a valid session', async () => {
    expect((await request(app).get('/api/v1/me/tickets')).status).toBe(401);
  });
  it('filters identifiers before totals and pagination', async () => {
    const r = await request(app).get(`/api/v1/me/tickets?ticketId=${id}&limit=1`).set(bearer(employee));
    expect(r.status).toBe(200); expect(r.body.meta.total).toBe(1);
    expect(r.body.data[0].id).toBe(id);
    const hidden = await request(app).get(`/api/v1/me/tickets?ticketId=${id}`).set(bearer(other));
    expect(hidden.body.meta.total).toBe(0);
  });
  it('rejects ownership substitution and invalid filters', async () => {
    expect((await request(app).get('/api/v1/me/tickets?userId=1').set(bearer(other))).status).toBe(400);
    expect((await request(app).get('/api/v1/me/tickets?status=Invalid').set(bearer(employee))).status).toBe(400);
  });
  it('hides foreign tickets consistently', async () => {
    expect((await request(app).get(`/api/v1/me/tickets/${id}`).set(bearer(other))).status).toBe(404);
  });
  it('protects both new and existing read endpoints', async () => {
    for (const url of [`/me/tickets/${id}`, `/tickets/${id}`, `/tickets/${id}/history`]) {
      const r = await request(app).get(`/api/v1${url}`).set(bearer(employee));
      expect(r.status).toBe(200); expect(JSON.stringify(r.body)).not.toContain('SECRETO FR018');
      if (!url.endsWith('/history')) {
        expect(r.body.data).not.toHaveProperty('updatedAt');
        expect(r.body.data).not.toHaveProperty('version');
        expect(r.body.data).toHaveProperty('lastVisibleUpdateAt');
      }
    }
  });
});
