import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

const newTicket = { 
  title: 'Unable to access the booking system', 
  description: 'Authentication error.', 
  categoryId: 2,
  storeLocation: 'Sucursal Centro',
  motorcycleModel: 'Italika FT150'
};

describe('tickets - full workflow', () => {
  let employee: string, advisor: string, technician: string, manager: string, other: string;
  let ticketId: number;

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    advisor = await loginAs('advisor@company.com');
    technician = await loginAs('technician@company.com');
    manager = await loginAs('manager@company.com');
    other = await loginAs('admin@company.com');
  });

  it('employee creates a ticket (status Open, no priority)', async () => {
    const res = await request(app).post('/api/v1/tickets').set(bearer(employee)).send(newTicket);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('Open');
    expect(res.body.data.priorityId).toBeNull();
    ticketId = res.body.data.id;
  });

  it('validates the body', async () => {
    const res = await request(app).post('/api/v1/tickets').set(bearer(employee)).send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    expect((await request(app).post('/api/v1/tickets').send(newTicket)).status).toBe(401);
  });

  it('hides tickets from users who are not owner/assigned/staff (404)', async () => {
    const res = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(other));
    expect(res.status).toBe(404);
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
      .send({ technicianId: 1 }); // id 1 = employee
    expect(bad.status).toBe(400);

    const good = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send({ technicianId: 2 });
    expect(good.status).toBe(200);
    expect(good.body.data.status).toBe('Assigned');
    expect(good.body.data.assignedTechnicianId).toBe(2);
  });

  it('technician notification was created', async () => {
    const res = await request(app).get('/api/v1/notifications').set(bearer(technician));
    expect(res.status).toBe(200);
    expect(res.body.data.some((n: { type: string }) => n.type === 'ticket.assigned')).toBe(true);
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
    expect(start.body.data.status).toBe('In Progress');

    const resolved = await request(app)
      .post(`/api/v1/tickets/${ticketId}/resolution`)
      .set(bearer(technician))
      .send({ resolution: 'Reset credentials and cleared cache.' });
    expect(resolved.body.data.status).toBe('Resolved');

    const closed = await request(app)
      .post(`/api/v1/tickets/${ticketId}/close`)
      .set(bearer(advisor))
      .send({});
    expect(closed.body.data.status).toBe('Closed');
  });

  it('keeps a full history and audit trail', async () => {
    const hist = await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(employee));
    expect(hist.body.data.length).toBeGreaterThanOrEqual(6);

    const audit = await request(app)
      .get('/api/v1/audit-logs?entity=ticket')
      .set(bearer(manager));
    expect(audit.status).toBe(200);
    expect(audit.body.data.length).toBeGreaterThan(0);
    expect((await request(app).get('/api/v1/audit-logs').set(bearer(employee))).status).toBe(403);
  });

  it('employee only lists their own tickets', async () => {
    const res = await request(app).get('/api/v1/tickets?page=1&limit=10').set(bearer(employee));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(res.body.data.length);
  });
});

describe('stub modules', () => {
  it('respond 501 in the standard error format', async () => {
    const token = await loginAs('employee@company.com');
    const res = await request(app).get('/api/v1/knowledge/articles').set(bearer(token));
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
  });
});

describe('FR-003 - Ticket Creation', () => {
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
