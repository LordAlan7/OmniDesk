import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

describe('FR-017 - Report generation', () => {
  let managerToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    managerToken = await loginAs('manager@company.com');
    employeeToken = await loginAs('employee@company.com');
  });

  it('lists available reports (authenticated)', async () => {
    const res = await request(app).get('/api/v1/reports').set(bearer(managerToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('type');
    expect(res.body.data[0]).toHaveProperty('label');
  });

  it('rejects anonymous access (401)', async () => {
    const res = await request(app).get('/api/v1/reports');
    expect(res.status).toBe(401);
  });

  it('manager can generate an overview report', async () => {
    const res = await request(app)
      .post('/api/v1/reports/generate')
      .set(bearer(managerToken))
      .send({ type: 'overview', filters: {} });
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('overview');
    expect(res.body.data.generatedAt).toBeDefined();
    expect(res.body.data.filters).toEqual({});
  });

  it('employee cannot generate reports (403)', async () => {
    const res = await request(app)
      .post('/api/v1/reports/generate')
      .set(bearer(employeeToken))
      .send({ type: 'overview', filters: {} });
    expect(res.status).toBe(403);
  });

  it('rejects invalid report type', async () => {
    const res = await request(app)
      .post('/api/v1/reports/generate')
      .set(bearer(managerToken))
      .send({ type: 'invalid-type', filters: {} });
    expect(res.status).toBe(400);
  });

  it('generates a tickets-activity report with date filters', async () => {
    const res = await request(app)
      .post('/api/v1/reports/generate')
      .set(bearer(managerToken))
      .send({
        type: 'tickets',
        filters: {
          from: '2025-01-01',
          to: '2026-12-31',
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('tickets');
  });
});