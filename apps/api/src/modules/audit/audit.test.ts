import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

const ticketBody = {
  title: 'Trazabilidad de cambios',
  description: 'Ticket para verificar NFR-009.',
  categoryId: 2,
  storeLocation: 'Sucursal Centro',
  motorcycleModel: 'Italika FT150',
};

describe.skip('NFR-009 traceability', () => {
  let employee: string;
  let advisor: string;
  let technician: string;
  let manager: string;
  let admin: string;
  let ticketId: number;

  const audit = async (query: string, token = manager) =>
    request(app).get(`/api/v1/audit-logs?${query}`).set(bearer(token));

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    advisor = await loginAs('advisor@company.com');
    technician = await loginAs('technician@company.com');
    manager = await loginAs('manager@company.com');
    admin = await loginAs('admin@company.com');

    ticketId = (await request(app).post('/api/v1/tickets').set(bearer(employee)).send(ticketBody)).body.data.id;
    const version = (await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor))).body.data.version;
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send({ technicianId: 2, expectedVersion: version, reason: 'Disponibilidad' });
    await request(app).patch(`/api/v1/tickets/${ticketId}/status`).set(bearer(technician)).send({ status: 'In Progress' });
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/progress-updates`)
      .set(bearer(technician))
      .send({ note: 'Contenido interno confidencial del avance.' });
  });

  it('reconstructs who did what, on which resource and what changed, in order', async () => {
    const res = await audit(`entity=ticket&entityId=${ticketId}&limit=100`);
    expect(res.status).toBe(200);

    const sequence = [...res.body.data].reverse();
    expect(sequence.map((r: { action: string }) => r.action)).toEqual([
      'ticket.created',
      'ticket.status_changed', // Open → Assigned (efecto de la asignación)
      'ticket.assigned',
      'ticket.status_changed', // Assigned → In Progress
      'ticket.progress_update',
    ]);

    const assigned = sequence.find((r: { action: string }) => r.action === 'ticket.assigned');
    expect(assigned).toMatchObject({
      entity: 'ticket',
      entityId: ticketId,
      actorId: 3,
      outcome: 'applied',
      metadata: { from: null, to: 2, reason: 'Disponibilidad' },
    });
    expect(Date.parse(assigned.createdAt)).not.toBeNaN();

    const status = sequence.filter((r: { action: string }) => r.action === 'ticket.status_changed');
    expect(status[1].metadata).toMatchObject({ from: 'Assigned', to: 'In Progress' });
  });

  it('shares a correlation id between connected events and the history', async () => {
    const res = await audit(`entity=ticket&entityId=${ticketId}&limit=100`);
    const assignedAudit = res.body.data.find((r: { action: string }) => r.action === 'ticket.assigned');
    expect(assignedAudit.correlationId).toMatch(/^req-/);

    // La asignación produjo dos eventos (estado + asignación) con la misma correlación.
    const sameOperation = await audit(`correlationId=${assignedAudit.correlationId}`);
    expect(sameOperation.body.data.map((r: { action: string }) => r.action).sort()).toEqual([
      'ticket.assigned',
      'ticket.status_changed',
    ]);

    const history = (await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(advisor))).body.data;
    expect(history.find((h: { action: string }) => h.action === 'assigned').correlationId).toBe(assignedAudit.correlationId);
  });

  it('resolves authors server-side for the internal timeline', async () => {
    const history = (await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(advisor))).body.data;
    expect(history.find((h: { action: string }) => h.action === 'assigned')).toMatchObject({
      actorId: 3,
      actorName: 'Demo Service Advisor',
    });
  });

  it('does not copy free-text progress notes into the audit log', async () => {
    const res = await audit(`action=ticket.progress_update&entity=ticket&entityId=${ticketId}`);
    expect(res.body.data).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('confidencial');
  });

  it('filters by actor, action, outcome and date range, with pagination', async () => {
    expect((await audit(`actorId=3&entity=ticket&entityId=${ticketId}`)).body.data.every((r: { actorId: number }) => r.actorId === 3)).toBe(true);

    const page = await audit(`entity=ticket&entityId=${ticketId}&limit=2&page=2`);
    expect(page.body.meta).toMatchObject({ page: 2, limit: 2, total: 5 });
    expect(page.body.data).toHaveLength(2);

    const future = await audit('from=2099-01-01T00:00:00Z');
    expect(future.body.data).toEqual([]);
    const past = await audit('to=2000-01-01T00:00:00Z');
    expect(past.body.data).toEqual([]);

    expect((await audit('from=2099-01-01T00:00:00Z&to=2000-01-01T00:00:00Z')).status).toBe(400);
    expect((await audit('from=ayer')).status).toBe(400);
    expect((await audit('outcome=maybe')).status).toBe(400);
    expect((await audit('unknown=1')).status).toBe(400);
  });

  it('keeps failed attempts apart from applied changes', async () => {
    await request(app).post('/api/v1/auth/login').send({ email: 'nadie@company.com', password: 'incorrecta' });

    const rejected = await audit('outcome=rejected');
    expect(rejected.body.data.length).toBeGreaterThan(0);
    expect(rejected.body.data.every((r: { outcome: string; action: string }) => r.outcome === 'rejected' && r.action === 'auth.login_failed')).toBe(true);

    const applied = await audit('outcome=applied&limit=100');
    expect(applied.body.data.some((r: { action: string }) => r.action === 'auth.login_failed')).toBe(false);
  });

  it('never stores credentials or tokens', async () => {
    const all = await audit('limit=100');
    const text = JSON.stringify(all.body);
    expect(text).not.toMatch(/ChangeMe123|passwordHash|accessToken|Bearer /);
    expect(text).not.toContain('incorrecta');
  });

  it('exposes the common event catalog to authorized users', async () => {
    const res = await request(app).get('/api/v1/audit-logs/catalog').set(bearer(manager));
    expect(res.status).toBe(200);
    expect(res.body.data.find((e: { action: string }) => e.action === 'ticket.assigned')).toMatchObject({
      entity: 'ticket',
      outcome: 'applied',
      implemented: true,
    });
  });

  it('is only readable by authorized roles', async () => {
    expect((await request(app).get('/api/v1/audit-logs')).status).toBe(401);
    for (const token of [employee, technician, advisor]) {
      expect((await audit('', token)).status).toBe(403);
      expect((await request(app).get('/api/v1/audit-logs/catalog').set(bearer(token))).status).toBe(403);
    }
    expect((await audit('', admin)).status).toBe(200);
  });

  it('offers no way to alter or delete audit records', async () => {
    const first = (await audit('limit=1')).body.data[0];

    for (const method of ['patch', 'put', 'delete', 'post'] as const) {
      for (const token of [manager, admin]) {
        const res = await request(app)[method](`/api/v1/audit-logs/${first.id}`).set(bearer(token)).send({ action: 'x' });
        expect([404, 405]).toContain(res.status);
      }
    }
    expect((await request(app).delete('/api/v1/audit-logs').set(bearer(admin))).status).toBe(404);

    const after = await request(app).get(`/api/v1/audit-logs/${first.id}`).set(bearer(manager));
    expect(after.body.data).toEqual(first);
  });

  it('shows the requester only the public history, never internal records', async () => {
    const history = (await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(employee))).body.data;
    expect(history.map((h: { action: string }) => h.action)).toEqual(['created', 'status_changed', 'status_changed']);
    const text = JSON.stringify(history);
    expect(text).not.toContain('confidencial');
    expect(text).not.toContain('correlationId');
    expect(text).not.toContain('Disponibilidad');
  });

  it('records no event when a change is rejected', async () => {
    const before = (await audit(`entity=ticket&entityId=${ticketId}&limit=100`)).body.meta.total;

    const invalid = await request(app).patch(`/api/v1/tickets/${ticketId}/status`).set(bearer(technician)).send({ status: 'Closed' });
    expect(invalid.status).toBe(400);
    const forbidden = await request(app)
      .post(`/api/v1/tickets/${ticketId}/progress-updates`)
      .set(bearer(employee))
      .send({ note: 'no debería guardarse' });
    expect(forbidden.status).toBe(403);

    expect((await audit(`entity=ticket&entityId=${ticketId}&limit=100`)).body.meta.total).toBe(before);
  });
});
