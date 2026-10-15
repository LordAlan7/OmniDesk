import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

const PASSWORD = 'PruebaUsuarios123!';

let sequence = 0;

function account(roles: string[] = ['Employee']) {
  sequence += 1;

  return {
    name: `Usuario QA ${sequence}`,
    email: `qa.users.${sequence}@company.com`,
    password: PASSWORD,
    roles,
  };
}

describe('users - FR-002', () => {
  let admin: string;
  let employee: string;
  let manager: string;
  let advisor: string;
  let administratorId: number;

  beforeAll(async () => {
    admin = await loginAs('admin@company.com');
    employee = await loginAs('employee@company.com');
    manager = await loginAs('manager@company.com');
    advisor = await loginAs('advisor@company.com');

    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(admin));

    expect(profile.status).toBe(200);
    administratorId = profile.body.data.id;
  });

  async function createAccount(roles: string[] = ['Employee']) {
    const data = account(roles);

    const response = await request(app)
      .post('/api/v1/users')
      .set(bearer(admin))
      .send(data);

    expect(response.status).toBe(201);

    return {
      data,
      user: response.body.data as {
        id: number;
        name: string;
        email: string;
        roles: string[];
        active: boolean;
      },
    };
  }

  async function loginAccount(email: string) {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(
      expect.any(String),
    );

    return response.body.data.accessToken as string;
  }

  it('requires authentication and denies employee access', async () => {
    const anonymous = await request(app)
      .get('/api/v1/users');

    expect(anonymous.status).toBe(401);

    const denied = await request(app)
      .get('/api/v1/users')
      .set(bearer(employee));

    expect(denied.status).toBe(403);
  });

  it('allows manager consultation but rejects account modifications', async () => {
    const listed = await request(app)
      .get('/api/v1/users')
      .set(bearer(manager));

    expect(listed.status).toBe(200);

    const created = await request(app)
      .post('/api/v1/users')
      .set(bearer(manager))
      .send(account());

    expect(created.status).toBe(403);

    const edited = await request(app)
      .patch(`/api/v1/users/${administratorId}`)
      .set(bearer(manager))
      .send({ name: 'Cambio no autorizado' });

    expect(edited.status).toBe(403);

    const rolesChanged = await request(app)
      .put(`/api/v1/users/${administratorId}/roles`)
      .set(bearer(manager))
      .send({ roles: ['Employee'] });

    expect(rolesChanged.status).toBe(403);

    const deactivated = await request(app)
      .patch(`/api/v1/users/${administratorId}`)
      .set(bearer(manager))
      .send({ active: false });

    expect(deactivated.status).toBe(403);
  });

  it('creates a technician without exposing credentials', async () => {
    const { user } = await createAccount(['Technician']);

    expect(user.active).toBe(true);
    expect(user.roles).toEqual(['Technician']);
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('passwordHash');

    const detail = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set(bearer(admin));

    expect(detail.status).toBe(200);
    expect(detail.body.data.email).toBe(user.email);
    expect(detail.body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate emails after normalization', async () => {
    const { data } = await createAccount();

    const response = await request(app)
      .post('/api/v1/users')
      .set(bearer(admin))
      .send({
        ...data,
        email: ` ${data.email.toUpperCase()} `,
      });

    expect(response.status).toBe(409);
  });

  it('rejects invalid fields, roles and unknown properties', async () => {
    const data = account();

    const cases = [
      { ...data, name: '' },
      { ...data, password: 'short' },
      { ...data, roles: ['Unknown'] },
      { ...data, roles: ['Employee', 'Employee'] },
      { ...data, passwordHash: 'manipulated' },
    ];

    for (const body of cases) {
      const response = await request(app)
        .post('/api/v1/users')
        .set(bearer(admin))
        .send(body);

      expect(response.status).toBe(400);
    }

    const lookup = await request(app)
      .get('/api/v1/users')
      .query({ search: data.email })
      .set(bearer(admin));

    expect(lookup.body.meta.total).toBe(0);
  });

  it('combines search, role, status and pagination', async () => {
    const { user } = await createAccount(['Technician']);

    const matching = await request(app)
      .get('/api/v1/users')
      .query({
        search: user.email,
        role: 'Technician',
        active: 'true',
        page: 1,
        limit: 1,
      })
      .set(bearer(admin));

    expect(matching.status).toBe(200);
    expect(matching.body.meta.total).toBe(1);
    expect(matching.body.data[0].id).toBe(user.id);

    const excluded = await request(app)
      .get('/api/v1/users')
      .query({
        search: user.email,
        role: 'Technician',
        active: 'false',
      })
      .set(bearer(admin));

    expect(excluded.body.meta.total).toBe(0);

    const secondPage = await request(app)
      .get('/api/v1/users')
      .query({
        search: user.email,
        role: 'Technician',
        active: 'true',
        page: 2,
        limit: 1,
      })
      .set(bearer(admin));

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.meta.total).toBe(1);
    expect(secondPage.body.data).toEqual([]);
  });

  it('updates name, email and roles together', async () => {
    const { user } = await createAccount();
    const email = `edited.${user.email}`;

    const updated = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set(bearer(admin))
      .send({
        name: 'Usuario editado',
        email,
        roles: ['Employee', 'Technician'],
      });

    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Usuario editado');
    expect(updated.body.data.email).toBe(email);
    expect(updated.body.data.roles).toEqual(
      expect.arrayContaining(['Employee', 'Technician']),
    );

    const detail = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set(bearer(admin));

    expect(detail.body.data.email).toBe(email);
  });

  it('rejects a duplicate email without partially changing the account', async () => {
    const first = await createAccount();
    const second = await createAccount();

    const rejected = await request(app)
      .patch(`/api/v1/users/${second.user.id}`)
      .set(bearer(admin))
      .send({
        name: 'No debe guardarse',
        email: first.user.email,
        roles: ['Technician'],
      });

    expect(rejected.status).toBe(409);

    const detail = await request(app)
      .get(`/api/v1/users/${second.user.id}`)
      .set(bearer(admin));

    expect(detail.body.data.name).toBe(second.user.name);
    expect(detail.body.data.email).toBe(second.user.email);
    expect(detail.body.data.roles).toEqual(['Employee']);
  });

  it('protects the last active administrator', async () => {
    const status = await request(app)
      .patch(`/api/v1/users/${administratorId}`)
      .set(bearer(admin))
      .send({ active: false });

    expect(status.status).toBe(409);

    const roles = await request(app)
      .put(`/api/v1/users/${administratorId}/roles`)
      .set(bearer(admin))
      .send({ roles: ['Employee'] });

    expect(roles.status).toBe(409);

    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(admin));

    expect(profile.status).toBe(200);
    expect(profile.body.data.roles).toContain('Administrator');
  });

  it('invalidates old sessions permanently after deactivation', async () => {
    const { data, user } = await createAccount();
    const oldToken = await loginAccount(data.email);

    const deactivated = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set(bearer(admin))
      .send({ active: false });

    expect(deactivated.status).toBe(200);

    const oldSession = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(oldToken));

    expect(oldSession.status).toBe(401);

    const blockedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: data.email, password: PASSWORD });

    expect(blockedLogin.status).toBe(401);

    const reactivated = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set(bearer(admin))
      .send({ active: true });

    expect(reactivated.status).toBe(200);

    const stillInvalid = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(oldToken));

    expect(stillInvalid.status).toBe(401);

    const newToken = await loginAccount(data.email);

    const newSession = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(newToken));

    expect(newSession.status).toBe(200);
    expect(newSession.body.data.id).toBe(user.id);
  });

  it('applies changed roles to an existing session', async () => {
    const { data, user } = await createAccount(['Manager']);
    const token = await loginAccount(data.email);

    const before = await request(app)
      .get('/api/v1/users')
      .set(bearer(token));

    expect(before.status).toBe(200);

    const changed = await request(app)
      .put(`/api/v1/users/${user.id}/roles`)
      .set(bearer(admin))
      .send({ roles: ['Employee'] });

    expect(changed.status).toBe(200);

    const after = await request(app)
      .get('/api/v1/users')
      .set(bearer(token));

    expect(after.status).toBe(403);

    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(token));

    expect(profile.status).toBe(200);
    expect(profile.body.data.roles).toEqual(['Employee']);
    expect(profile.body.data.permissions).not.toContain(
      'users:read:list',
    );
  });

  it('combines permissions for accounts with several roles', async () => {
    const { data } = await createAccount([
      'Employee',
      'Manager',
    ]);

    const token = await loginAccount(data.email);

    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(token));

    expect(profile.status).toBe(200);
    expect(profile.body.data.permissions).toEqual(
      expect.arrayContaining([
        'tickets:create',
        'users:read:list',
      ]),
    );

    const permissions = profile.body.data.permissions as string[];

    expect(new Set(permissions).size).toBe(permissions.length);
  });

  it('blocks technician removal until assigned tickets are closed', async () => {
    const { data, user } = await createAccount(['Technician']);
    const technicianToken = await loginAccount(data.email);

    const created = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({
        title: 'Ticket para verificar protección del técnico',
        description: 'Caso de prueba de gestión de usuarios.',
        categoryId: 2,
      });

    expect(created.status).toBe(201);
    const ticketId = created.body.data.id;

    const assigned = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send({ technicianId: user.id });

    expect(assigned.status).toBe(200);

    const blockedStatus = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set(bearer(admin))
      .send({ active: false });

    expect(blockedStatus.status).toBe(409);

    const blockedRoles = await request(app)
      .put(`/api/v1/users/${user.id}/roles`)
      .set(bearer(admin))
      .send({ roles: ['Employee'] });

    expect(blockedRoles.status).toBe(409);

    const profile = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set(bearer(admin));

    expect(profile.body.data.active).toBe(true);
    expect(profile.body.data.roles).toEqual(['Technician']);

    const inProgress = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set(bearer(technicianToken))
      .send({ status: 'In Progress' });

    expect(inProgress.status).toBe(200);

    const resolved = await request(app)
      .post(`/api/v1/tickets/${ticketId}/resolution`)
      .set(bearer(technicianToken))
      .send({ resolution: 'Problema corregido y verificado.' });

    expect(resolved.status).toBe(200);

    // Resolved todavía cuenta como pendiente hasta el cierre.
    const blockedResolved = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set(bearer(admin))
      .send({ active: false });

    expect(blockedResolved.status).toBe(409);

    const closed = await request(app)
      .post(`/api/v1/tickets/${ticketId}/close`)
      .set(bearer(advisor))
      .send({});

    expect(closed.status).toBe(200);

    const rolesChanged = await request(app)
      .put(`/api/v1/users/${user.id}/roles`)
      .set(bearer(admin))
      .send({ roles: ['Employee'] });

    expect(rolesChanged.status).toBe(200);

    const deactivated = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set(bearer(admin))
      .send({ active: false });

    expect(deactivated.status).toBe(200);

    const preservedTicket = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set(bearer(advisor));

    expect(preservedTicket.status).toBe(200);
    expect(preservedTicket.body.data.status).toBe('Closed');
    expect(preservedTicket.body.data.assignedTechnicianId).toBe(
      user.id,
    );
  });
});