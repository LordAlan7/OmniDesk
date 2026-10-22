import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

const newTicket = { title: 'Unable to access the booking system', description: 'Authentication error.', categoryId: 2, storeLocation: 'Sucursal Centro',
  motorcycleModel: 'Italika FT150', };

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
    const endpoint = `/api/v1/tickets/${ticketId}/eligible-technicians`;
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
    const before = await request(app).get(endpoint).set(bearer(advisor));
    const historyBefore = await request(app).get(`${endpoint}/history`).set(bearer(advisor));

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

    const after = await request(app).get(endpoint).set(bearer(advisor));
    const historyAfter = await request(app).get(`${endpoint}/history`).set(bearer(advisor));
    expect(after.body.data).toEqual(before.body.data);
    expect(historyAfter.body.data).toEqual(historyBefore.body.data);
  });

  it('only a manager can set priority', async () => {
    const ticketRes = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(manager));
    
    const denied = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set(bearer(advisor))
      .send({ priorityId: 3, expectedVersion: ticketRes.body.data.version });

    expect(denied.status).toBe(403);

    const okRes = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set(bearer(manager))
      .send({ priorityId: 3, expectedVersion: ticketRes.body.data.version });

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
    const ticketBefore = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));
    const historyBefore = await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(advisor));
    const notificationsBefore = await request(app).get('/api/v1/notifications').set(bearer(technician));

    const result = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send(await assignmentBody(2));

    expect(result.status).toBe(200);
    expect(result.body.data.assignedTechnicianId).toBe(ticketBefore.body.data.assignedTechnicianId);

    const historyAfter = await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(advisor));
    const notificationsAfter = await request(app).get('/api/v1/notifications').set(bearer(technician));

    expect(historyAfter.body.data).toEqual(historyBefore.body.data);
    expect(notificationsAfter.body.data).toEqual(notificationsBefore.body.data);
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

    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('In Progress');

    const resolved = await request(app)
      .post(`/api/v1/tickets/${ticketId}/resolution`)
      .set(bearer(technician))
      .send({ resolution: 'Reset credentials and cleared cache.' });

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
    const hist = await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(employee));
    expect(hist.status).toBe(200);
    expect(hist.body.data.length).toBeGreaterThanOrEqual(5);

    const audit = await request(app).get('/api/v1/audit-logs?entity=ticket').set(bearer(manager));
    expect(audit.status).toBe(200);
    expect(audit.body.data.length).toBeGreaterThan(0);

    const denied = await request(app).get('/api/v1/audit-logs').set(bearer(employee));
    expect(denied.status).toBe(403);
  });

  it('employee only lists their own tickets', async () => {
    const res = await request(app).get('/api/v1/tickets?page=1&limit=10').set(bearer(employee));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(res.body.data.length);
  });
});

describe('knowledge module', () => {
  it('lists articles (now implemented)', async () => {
    const token = await loginAs('employee@company.com');
    const res = await request(app).get('/api/v1/knowledge/articles').set(bearer(token));
    expect(res.status).toBe(200); // Ya no es 501
    expect(res.body.data).toBeDefined();
  });
});

describe('FR-003 - Ticket Creation', () => {
  const newTicket = {
    title: 'Falla de acceso',
    description: 'No puedo iniciar sesión en el sistema.',
    categoryId: 2,
    storeLocation: 'Sucursal Centro',
    motorcycleModel: 'Italika FT150'
  };
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
      .send({ title: 'Valid Title', description: '     ', categoryId: 2, storeLocation: 'Sur', motorcycleModel: 'Modelo' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /tickets - rejects missing categoryId', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({ title: 'Test', description: 'Test desc', storeLocation: 'Sur', motorcycleModel: 'Modelo' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: any) => d.field === 'categoryId')).toBe(true);
  });
});

describe('FR-003 + FR-007 integration', () => {
  it('preserves business fields and rejects stale edits after assignment', async () => {
    const employee = await loginAs('employee@company.com');
    const advisor = await loginAs('advisor@company.com');
    const created = await request(app).post('/api/v1/tickets').set(bearer(employee)).send({
      title: 'Ticket Integración',
      description: 'Test de integración.',
      categoryId: 2,
      storeLocation: 'Sucursal Centro',
      motorcycleModel: 'Italika FT150',
    });
    expect(created.status).toBe(201);
    const endpoint = `/api/v1/tickets/${created.body.data.id}`;
    const assigned = await request(app).patch(`${endpoint}/assignment`).set(bearer(advisor)).send({
      technicianId: 2, expectedVersion: created.body.data.version,
    });
    expect(assigned.status).toBe(200);

    expect(assigned.body.data).toMatchObject({
      storeLocation: 'Sucursal Centro',
      motorcycleModel: 'Italika FT150',
      version: 2
    });

    const stale = await request(app).patch(endpoint).set(bearer(advisor)).send({
      title: 'Cambio obsoleto', version: created.body.data.version,
    });
    expect(stale.status).toBe(409);

    const edited = await request(app).patch(endpoint).set(bearer(advisor)).send({
      title: 'Cambio vigente', version: assigned.body.data.version,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ version: 3, storeLocation: 'Sucursal Centro', assignedTechnicianId: 2 });
  });
});

describe('FR-006 - Gestión de prioridad', () => {
  let employee: string;
  let manager: string;
  let advisor: string;
  let ticketId: number;

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    manager = await loginAs('manager@company.com');
    advisor = await loginAs('advisor@company.com');

    const res = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({
        title: 'Ticket para FR-006',
        description: 'Prueba de prioridad.',
        categoryId: 2,
        storeLocation: 'Centro',
        motorcycleModel: 'FT150',
      });

    ticketId = res.body.data.id;
  });

  it('GET /ticket-priorities - returns enriched catalog', async () => {
    const res = await request(app).get('/api/v1/ticket-priorities').set(bearer(employee));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(4);
    expect(res.body.data[0]).toHaveProperty('description');
    expect(res.body.data[0]).toHaveProperty('sortOrder');
  });

  it('manager sets priority with reason', async () => {
    const ticketRes = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(manager));
    const version = ticketRes.body.data.version;

    const res = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set(bearer(manager))
      .send({ priorityId: 3, expectedVersion: version, reason: 'Cliente VIP' });

    expect(res.status).toBe(200);
    expect(res.body.data.priorityId).toBe(3);

    const hist = await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(manager));
    const priorityEvent = hist.body.data.find((e: any) => e.action === 'priority_changed');
    expect(priorityEvent).toBeDefined();
    expect(priorityEvent.reason).toBe('Cliente VIP');
  });

  it('setting the same priority does not generate a new event', async () => {
    const ticketRes = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(manager));
    const version = ticketRes.body.data.version;
    const histBefore = await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(manager));

    const res = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set(bearer(manager))
      .send({ priorityId: 3, expectedVersion: version });

    expect(res.status).toBe(200);

    const histAfter = await request(app).get(`/api/v1/tickets/${ticketId}/history`).set(bearer(manager));
    expect(histAfter.body.data.length).toBe(histBefore.body.data.length);
  });

  it('rejects stale version with 409', async () => {
    const res = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set(bearer(manager))
      .send({ priorityId: 1, expectedVersion: 999 });

    expect(res.status).toBe(409);
  });

  it('advisor cannot change priority (403)', async () => {
    const ticketRes = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));
    const res = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set(bearer(advisor))
      .send({ priorityId: 1, expectedVersion: ticketRes.body.data.version });

    expect(res.status).toBe(403);
  });
});

describe('FR-004 - Evidencia y adjuntos', () => {
  let employee: string;
  let manager: string;
  let other: string; // admin sin acceso al ticket
  let ticketId: number;

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    manager = await loginAs('manager@company.com');
    other = await loginAs('admin@company.com');

    const res = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({
        title: 'Ticket para FR-004',
        description: 'Prueba de adjuntos.',
        categoryId: 2,
        storeLocation: 'Centro',
        motorcycleModel: 'FT150',
      });

    ticketId = res.body.data.id;
  });

  it('uploads a valid image attachment', async () => {
    // PNG válido (1x1 pixel transparente)
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);

    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set(bearer(employee))
      .attach('file', pngBuffer, { filename: 'evidencia.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.data.originalName).toBe('evidencia.png');
    expect(res.body.data.mimeType).toBe('image/png');
    expect(res.body.data.sizeBytes).toBe(pngBuffer.length);
  });

  it('lists attachments for the ticket', async () => {
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments`)
      .set(bearer(employee));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].originalName).toBe('evidencia.png');
  });

  it('downloads the attachment content', async () => {
    const listRes = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments`)
      .set(bearer(employee));
    
    const attId = listRes.body.data[0].id;

    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments/${attId}/content`)
      .set(bearer(employee));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('rejects file with wrong extension vs content', async () => {
    // Un archivo que dice ser PDF pero es texto
    const fakePdf = Buffer.from('Esto no es un PDF, es texto plano.');

    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set(bearer(employee))
      .attach('file', fakePdf, { filename: 'fake.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unsupported format (exe)', async () => {
    const exeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00]); // CAB MZ

    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set(bearer(employee))
      .attach('file', exeBuffer, { filename: 'virus.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects access from unauthorized user (404)', async () => {
    // admin no tiene acceso al ticket porque no lo creó y no tiene TICKETS_READ_ALL
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments`)
      .set(bearer(other));

    expect(res.status).toBe(404);
  });

  it('rejects attachment from unrelated ticket+attachment IDs', async () => {
    const listRes = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments`)
      .set(bearer(employee));
    
    const attId = listRes.body.data[0].id;

    // Crear otro ticket
    const newTicket = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({
        title: 'Otro ticket',
        description: 'Otro ticket.',
        categoryId: 2,
        storeLocation: 'Sur',
        motorcycleModel: 'DM150',
      });

    // Intentar descargar el adjunto del primer ticket usando el ID del segundo
    const res = await request(app)
      .get(`/api/v1/tickets/${newTicket.body.data.id}/attachments/${attId}/content`)
      .set(bearer(employee));

    expect(res.status).toBe(404);
  });

  it('records upload in audit log', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs?entity=ticket&action=ticket.attachment_uploaded')
      .set(bearer(manager));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
