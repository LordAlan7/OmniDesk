import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

describe('AIR-003 - Seguridad de versiones documentales', () => {
  test('rechaza descargas sin autenticacion', async () => {
    const result = await request(app)
      .get('/api/v1/knowledge/documents/1/content?expectedVersion=v1');

    expect(result.status).toBe(401);
  });

  test('rechaza una version esperada vacia', async () => {
    const token = await loginAs('technician@company.com');

    const result = await request(app)
      .get('/api/v1/knowledge/documents/1/content?expectedVersion=')
      .set(bearer(token));

    expect(result.status).toBe(400);
  });

  test('rechaza versiones con longitud excesiva', async () => {
    const token = await loginAs('technician@company.com');

    const result = await request(app)
      .get(
        '/api/v1/knowledge/documents/1/content?expectedVersion=' +
        'x'.repeat(129)
      )
      .set(bearer(token));

    expect(result.status).toBe(400);
  });

  test('rechaza multiples valores de version', async () => {
    const token = await loginAs('technician@company.com');

    const result = await request(app)
      .get(
        '/api/v1/knowledge/documents/1/content' +
        '?expectedVersion=v1&expectedVersion=v2'
      )
      .set(bearer(token));

    expect(result.status).toBe(400);
  });
});