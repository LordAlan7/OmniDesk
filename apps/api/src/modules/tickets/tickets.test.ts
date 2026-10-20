import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

const newTicket = {
  title: 'Unable to access the booking system',
  description: 'Authentication error.',
  categoryId: 2,
};

describe('tickets - full workflow', () => {
  let employee: string;
  let advisor: string;
  let technician: string;
  let manager: string;
  let other: string;
  let ticketId: number;
    async function assignmentBody(technicianId: number) {
    const response = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set(bearer(advisor));

    expect(response.status).toBe(200);

    return {
      technicianId,
      expectedVersion: response.body.data.version,
    };
  }

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    advisor = await loginAs('advisor@company.com');
    technician = await loginAs('technician@company.com');
    manager = await loginAs('manager@company.com');
    other = await loginAs('admin@company.com');
  });

  it('employee creates a ticket (status Open, no priority)', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send(newTicket);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('Open');
    expect(res.body.data.priorityId).toBeNull();

    ticketId = res.body.data.id;
  });

  it('validates the body', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({ title: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .send(newTicket);

    expect(res.status).toBe(401);
  });

  it('hides tickets from users who are not owner/assigned/staff (404)', async () => {
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set(bearer(other));

    expect(res.status).toBe(404);
  });

  it('advisor can query technician candidates with only id and name', async () => {
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}/eligible-technicians`)
      .set(bearer(advisor));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: 2, name: 'Demo Technician' },
    ]);
  });

  it('technician candidates require authentication and assignment permission', async () => {
    const endpoint =
      `/api/v1/tickets/${ticketId}/eligible-technicians`;

    const anonymous = await request(app).get(endpoint);
    expect(anonymous.status).toBe(401);

    for (const token of [employee, technician, other]) {
      const denied = await request(app)
        .get(endpoint)
        .set(bearer(token));

      expect(denied.status).toBe(403);
    }
  });

  it('rejects assignment deadline changes without modifying the ticket or history', async () => {
    const endpoint = `/api/v1/tickets/${ticketId}`;

    const before = await request(app)
      .get(endpoint)
      .set(bearer(advisor));

    const historyBefore = await request(app)
      .get(`${endpoint}/history`)
      .set(bearer(advisor));

    expect(before.status).toBe(200);
    expect(historyBefore.status).toBe(200);

    const rejected = await request(app)
      .patch(`${endpoint}/assignment`)
      .set(bearer(advisor))
      .send({
        technicianId: 2,
        expectedVersion: before.body.data.version,
        dueDate: '2030-01-01T12:00:00.000Z',
      });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('VALIDATION_ERROR');
    expect(rejected.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'dueDate' }),
      ]),
    );

    const after = await request(app)
      .get(endpoint)
      .set(bearer(advisor));

    const historyAfter = await request(app)
      .get(`${endpoint}/history`)
      .set(bearer(advisor));

    expect(after.status).toBe(200);
    expect(historyAfter.status).toBe(200);
    expect(after.body.data).toEqual(before.body.data);
    expect(historyAfter.body.data)
      .toEqual(historyBefore.body.data);
  });

  it('only a manager can set priority', async () => {
    const denied = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set(bearer(advisor))
      .send({ priorityId: 3 });

    expect(denied.status).toBe(403);

    const okRes = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set(bearer(manager))
      .send({ priorityId: 3 });

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.priorityId).toBe(3);
  });

  it('advisor assigns a technician -> status Assigned; non-technician is rejected', async () => {
    const bad = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send(await assignmentBody(1));
    expect(bad.status).toBe(400);

    const good = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send(await assignmentBody(2));

    expect(good.status).toBe(200);
    expect(good.body.data.status).toBe('Assigned');
    expect(good.body.data.assignedTechnicianId).toBe(2);
  });

  it('assigning the current technician does not change the ticket or duplicate events', async () => {
    const ticketBefore = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set(bearer(advisor));

    const historyBefore = await request(app)
      .get(`/api/v1/tickets/${ticketId}/history`)
      .set(bearer(advisor));

    const notificationsBefore = await request(app)
      .get('/api/v1/notifications')
      .set(bearer(technician));

    expect(ticketBefore.status).toBe(200);
    expect(historyBefore.status).toBe(200);
    expect(notificationsBefore.status).toBe(200);

     const result = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send(await assignmentBody(2));

    expect(result.status).toBe(200);
    expect(result.body.data).toEqual(ticketBefore.body.data);

    const historyAfter = await request(app)
      .get(`/api/v1/tickets/${ticketId}/history`)
      .set(bearer(advisor));

    const notificationsAfter = await request(app)
      .get('/api/v1/notifications')
      .set(bearer(technician));

    expect(historyAfter.status).toBe(200);
    expect(notificationsAfter.status).toBe(200);

    expect(historyAfter.body.data).toEqual(
      historyBefore.body.data,
    );

    expect(notificationsAfter.body.data).toEqual(
      notificationsBefore.body.data,
    );
  });

  it('technician notification was created', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set(bearer(technician));

    expect(res.status).toBe(200);
    expect(
      res.body.data.some(
        (n: { type: string }) => n.type === 'ticket.assigned',
      ),
    ).toBe(true);
  });

  it('invalid transitions are rejected (cannot resolve directly from Assigned)', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/resolution`)
      .set(bearer(technician))
      .send({ resolution: 'Restarted the service.' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('technician works it: In Progress -> Resolved -> Closed', async () => {
    const start = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set(bearer(technician))
      .send({ status: 'In Progress' });

    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('In Progress');

    const resolved = await request(app)
      .post(`/api/v1/tickets/${ticketId}/resolution`)
      .set(bearer(technician))
      .send({
        resolution: 'Reset credentials and cleared cache.',
      });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('Resolved');

    const closed = await request(app)
      .post(`/api/v1/tickets/${ticketId}/close`)
      .set(bearer(advisor))
      .send({});

    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('Closed');
  });

  it('keeps a full history and audit trail', async () => {
    const hist = await request(app)
      .get(`/api/v1/tickets/${ticketId}/history`)
      .set(bearer(employee));

    expect(hist.status).toBe(200);
    expect(hist.body.data.length).toBeGreaterThanOrEqual(6);

    const audit = await request(app)
      .get('/api/v1/audit-logs?entity=ticket')
      .set(bearer(manager));

    expect(audit.status).toBe(200);
    expect(audit.body.data.length).toBeGreaterThan(0);

    const denied = await request(app)
      .get('/api/v1/audit-logs')
      .set(bearer(employee));

    expect(denied.status).toBe(403);
  });

  it('employee only lists their own tickets', async () => {
    const res = await request(app)
      .get('/api/v1/tickets?page=1&limit=10')
      .set(bearer(employee));

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(res.body.data.length);
  });
});

describe('stub modules', () => {
  it('respond 501 in the standard error format', async () => {
    const token = await loginAs('employee@company.com');

    const res = await request(app)
      .get('/api/v1/knowledge/articles')
      .set(bearer(token));

    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
  });
});
describe('FR-003 - Ticket Creation', () => {
  const newTicket = { title: 'Falla de acceso', description: 'No puedo iniciar sesión en el sistema.', categoryId: 2, storeLocation: 'Sucursal Centro', motorcycleModel: 'Italika FT150' };
  let employee: string;

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
  });

  it('GET /tickets/categories - returns the category catalog', async () => {
    const res = await request(app).get('/api/v1/tickets/categories').set(bearer(employee));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0]).toHaveProperty('name');
  });

  it('POST /tickets - creates a ticket with business info (FR-010)', async () => {
    const res = await request(app).post('/api/v1/tickets').set(bearer(employee)).send(newTicket);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('Open');
    expect(res.body.data.storeLocation).toBe('Sucursal Centro');
    expect(res.body.data.motorcycleModel).toBe('Italika FT150');
    expect(res.body.data.priorityId).toBeNull();
    expect(res.body.data.assignedTechnicianId).toBeNull();
  });

  it('POST /tickets - rejects description with only spaces', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({ title: 'Valid Title', description: '     ', categoryId: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /tickets - prevents duplicate creation with Idempotency-Key', async () => {
    const headers = { ...bearer(employee), 'Idempotency-Key': 'test-key-123' };

    // Primera petición
    const res1 = await request(app).post('/api/v1/tickets').set(headers).send(newTicket);
    expect(res1.status).toBe(201);
    const firstTicketId = res1.body.data.id;

    // Segunda petición con la misma llave
    const res2 = await request(app).post('/api/v1/tickets').set(headers).send(newTicket);
    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBe(firstTicketId); // Debe devolver el mismo ticket
  });

  it('POST /tickets - rejects missing categoryId', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({ title: 'Test', description: 'Test desc' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: any) => d.field === 'categoryId')).toBe(true);
  });

  it('POST /tickets - rejects invalid category ID', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({ title: 'Test', description: 'Test desc', categoryId: 9999 });

    expect(res.status).toBe(400);
  });
});


describe('FR-003 + FR-007 integration', () => {
  it('preserves business fields and rejects stale edits after assignment', async () => {
    const employee = await loginAs('employee@company.com');
    const advisor = await loginAs('advisor@company.com');
    const created = await request(app).post('/api/v1/tickets').set(bearer(employee)).send({
      ...newTicket, storeLocation: 'Sucursal Centro', motorcycleModel: 'Italika FT150',
    });
    expect(created.status).toBe(201);
    const endpoint = `/api/v1/tickets/${created.body.data.id}`;
    const assigned = await request(app).patch(`${endpoint}/assignment`).set(bearer(advisor)).send({
      technicianId: 2, expectedVersion: created.body.data.version,
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data).toMatchObject({ storeLocation: 'Sucursal Centro', motorcycleModel: 'Italika FT150', version: 2 });
    const stale = await request(app).patch(endpoint).set(bearer(advisor)).send({
      title: 'Cambio obsoleto', version: created.body.data.version,
    });
    expect(stale.status).toBe(409);
    const edited = await request(app).patch(endpoint).set(bearer(advisor)).send({
      title: 'Cambio vigente', version: assigned.body.data.version,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ version: 3, storeLocation: 'Sucursal Centro', assignedTechnicianId: 2 });
    const history = await request(app).get(`${endpoint}/history`).set(bearer(advisor));
    expect(history.body.data.map((e: { action: string }) => e.action)).toEqual(['created', 'status_changed', 'assigned', 'updated']);
  });
});
