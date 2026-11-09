jest.mock('../../shared/db/pool', () => ({
  ...jest.requireActual('../../shared/db/pool'),
  checkDatabaseHealth: jest.fn().mockResolvedValue('connected'),
}));

import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

describe('auth', () => {
  it('health is public', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('logs in with valid credentials and never exposes the password hash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'employee@company.com', password: 'ChangeMe123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.tokenType).toBe('Bearer');
    expect(res.body.data.user.roles).toEqual(['Employee']);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects wrong credentials with a generic 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'employee@company.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('returns VALIDATION_ERROR with details for a bad body', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('protects /auth/me and returns the profile with a token', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    const token = await loginAs('manager@company.com');
    const res = await request(app).get('/api/v1/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('manager@company.com');
  });
});

describe('security headers and limits (NFR-002)', () => {
  it('sends HSTS and hides the framework', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('never returns a stack trace for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });
});
