import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

const newTicket = {
  title: 'Unable to access the booking system',
  description: 'Authentication error.',
  categoryId: 2,
  storeLocation: 'Sucursal Centro',
  motorcycleModel: 'Italika FT150',
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
      .send({ resolution: 'Restarted the service.', resolutionVerification: 'Tested login successfully.' });

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

    // FR-009: resolución ampliada (solution + verification + opcional cause/observations/knowledge)
    const resolved = await request(app)
      .post(`/api/v1/tickets/${ticketId}/resolution`)
      .set(bearer(technician))
      .send({
        resolution: 'Reset credentials and cleared cache.',
        resolutionVerification: 'Confirmed the user could log in successfully.',
        rootCause: 'Stale browser cache.',
        observations: 'No further action required.',
      });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('Resolved');
    expect(resolved.body.data.resolution).toBe('Reset credentials and cleared cache.');
    expect(resolved.body.data.resolutionVerification).toBe('Confirmed the user could log in successfully.');
    expect(resolved.body.data.rootCause).toBe('Stale browser cache.');
    expect(resolved.body.data.resolutionObservations).toBe('No further action required.');

    // FR-009 (decisión 1): el técnico que resolvió PUEDE cerrar si sigue asignado.
    const closedByTech = await request(app)
      .post(`/api/v1/tickets/${ticketId}/close`)
      .set(bearer(technician))
      .send({});

    expect(closedByTech.status).toBe(200);
    expect(closedByTech.body.data.status).toBe('Closed');
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

describe.skip('FR-006 - Gestión de prioridad', () => {
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
    const fakePdf = Buffer.from('Esto no es un PDF, es texto plano.');

    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set(bearer(employee))
      .attach('file', fakePdf, { filename: 'fake.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unsupported format (exe)', async () => {
    const exeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00]);

    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set(bearer(employee))
      .attach('file', exeBuffer, { filename: 'virus.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects access from unauthorized user (404)', async () => {
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

// =============================================================================
// FR-009 — Investigación, resolución y cierre de tickets
// =============================================================================

describe('FR-009 - Investigación, resolución y cierre', () => {
  let employee: string;
  let advisor: string;
  let technician: string;
  let manager: string;
  let ticketId: number;

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    advisor = await loginAs('advisor@company.com');
    technician = await loginAs('technician@company.com');
    manager = await loginAs('manager@company.com');

    const created = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({
        title: 'Ticket FR-009',
        description: 'Prueba de investigación, resolución y cierre.',
        categoryId: 2,
        storeLocation: 'Centro',
        motorcycleModel: 'FT150',
      });

    ticketId = created.body.data.id;

    // Asignar a técnico para que pueda investigar y resolver.
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send({ technicianId: 2, expectedVersion: created.body.data.version });

    // Pasar a In Progress (necesario antes de resolver).
    const ticket = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set(bearer(technician))
      .send({ status: 'In Progress', expectedVersion: ticket.body.data.version });
  });

  describe('investigaciones', () => {
    it('un técnico asignado puede registrar una actividad de investigación', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketId}/investigations`)
        .set(bearer(technician))
        .send({
          activity: 'Revisé los logs del servicio de autenticación.',
          result: 'Encontré errores 401 repetidos para el usuario afectado.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        ticketId,
        authorId: 2,
        authorName: 'Demo Technician',
        activity: 'Revisé los logs del servicio de autenticación.',
        result: 'Encontré errores 401 repetidos para el usuario afectado.',
        knowledgeArticleId: null,
        knowledgeArticleTitle: null,
      });
      expect(Date.parse(res.body.data.createdAt)).not.toBeNaN();
    });

    it('conserva la investigación después de recargar (consultar)', async () => {
      const list = await request(app)
        .get(`/api/v1/tickets/${ticketId}/investigations`)
        .set(bearer(technician));

      expect(list.status).toBe(200);
      expect(list.body.data.length).toBe(1);
      expect(list.body.data[0].activity).toBe('Revisé los logs del servicio de autenticación.');
      expect(list.body.data[0].authorName).toBe('Demo Technician');
    });

    it('rechaza una investigación sin actividad o resultado (validación)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketId}/investigations`)
        .set(bearer(technician))
        .send({ activity: '   ', result: 'Ok' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('un empleado sin acceso al ticket no puede ver investigaciones (404)', async () => {
      const admin = await loginAs('admin@company.com');
      const res = await request(app)
        .get(`/api/v1/tickets/${ticketId}/investigations`)
        .set(bearer(admin));

      expect(res.status).toBe(404); // admin no creó el ticket ni tiene tickets:read:all
    });

    it('el solicitante (creador) no ve las investigaciones (notas internas, decisión 7)', async () => {
      const res = await request(app)
        .get(`/api/v1/tickets/${ticketId}/investigations`)
        .set(bearer(employee));

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]); // array vacío: el solicitante no ve notas internas
    });

    it('un usuario sin sesión válida recibe 401', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketId}/investigations`)
        .send({ activity: 'x', result: 'y' });

      expect(res.status).toBe(401);
    });

    it('no se pueden registrar investigaciones en un ticket cerrado', async () => {
      // Resolver y cerrar primero
      const ticket = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/resolution`)
        .set(bearer(technician))
        .send({
          resolution: 'Reinicié el servicio de autenticación.',
          resolutionVerification: 'Confirmé que el usuario pudo iniciar sesión.',
        });
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/close`)
        .set(bearer(technician))
        .send({});

      const res = await request(app)
        .post(`/api/v1/tickets/${ticketId}/investigations`)
        .set(bearer(technician))
        .send({ activity: 'Investigación tardía', result: 'No aplica' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });
  });

  describe('resolución ampliada', () => {
    let anotherTicketId: number;

    beforeAll(async () => {
      const created = await request(app)
        .post('/api/v1/tickets')
        .set(bearer(employee))
        .send({
          title: 'Otro ticket FR-009',
          description: 'Para probar resolución ampliada.',
          categoryId: 2,
          storeLocation: 'Sur',
          motorcycleModel: 'RT200',
        });
      anotherTicketId = created.body.data.id;
      await request(app)
        .patch(`/api/v1/tickets/${anotherTicketId}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 2, expectedVersion: created.body.data.version });
      const ticket = await request(app).get(`/api/v1/tickets/${anotherTicketId}`).set(bearer(advisor));
      await request(app)
        .patch(`/api/v1/tickets/${anotherTicketId}/status`)
        .set(bearer(technician))
        .send({ status: 'In Progress', expectedVersion: ticket.body.data.version });
    });

    it('requiere comprobación del resultado (campo obligatorio)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${anotherTicketId}/resolution`)
        .set(bearer(technician))
        .send({ resolution: 'Solo la solución.' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d: any) => d.field === 'resolutionVerification')).toBe(true);
    });

    it('rechaza resolución compuesta solo por espacios', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${anotherTicketId}/resolution`)
        .set(bearer(technician))
        .send({ resolution: '    ', resolutionVerification: 'Verificada.' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rechaza referencia a artículo inexistente', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${anotherTicketId}/resolution`)
        .set(bearer(technician))
        .send({
          resolution: 'Solucionado.',
          resolutionVerification: 'Probado.',
          knowledgeArticleId: 999999,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('un empleado no puede resolver (403)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${anotherTicketId}/resolution`)
        .set(bearer(employee))
        .send({ resolution: 'x', resolutionVerification: 'y' });

      expect(res.status).toBe(403);
    });

    it('permite resolver sin artículo de conocimiento (la ausencia no bloquea)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${anotherTicketId}/resolution`)
        .set(bearer(technician))
        .send({
          resolution: 'Configuré las credenciales correctas.',
          resolutionVerification: 'El usuario confirmó acceso.',
          rootCause: 'Contraseña desactualizada.',
          observations: 'Se recomienda rotación trimestral.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Resolved');
      expect(res.body.data.resolution).toBe('Configuré las credenciales correctas.');
      expect(res.body.data.resolutionVerification).toBe('El usuario confirmó acceso.');
      expect(res.body.data.rootCause).toBe('Contraseña desactualizada.');
      expect(res.body.data.resolutionObservations).toBe('Se recomienda rotación trimestral.');
      expect(res.body.data.knowledgeArticleId).toBeNull();
    });
  });

  describe('cierre por técnico que resolvió (decisión 1)', () => {
    let ticketToClose: number;

    beforeAll(async () => {
      const created = await request(app)
        .post('/api/v1/tickets')
        .set(bearer(employee))
        .send({
          title: 'Ticket para cierre por técnico',
          description: 'Probando que el técnico que resolvió puede cerrar.',
          categoryId: 2,
          storeLocation: 'Centro',
          motorcycleModel: 'FT150',
        });
      ticketToClose = created.body.data.id;
      await request(app)
        .patch(`/api/v1/tickets/${ticketToClose}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 2, expectedVersion: created.body.data.version });
      const ticket = await request(app).get(`/api/v1/tickets/${ticketToClose}`).set(bearer(advisor));
      await request(app)
        .patch(`/api/v1/tickets/${ticketToClose}/status`)
        .set(bearer(technician))
        .send({ status: 'In Progress', expectedVersion: ticket.body.data.version });
      await request(app)
        .post(`/api/v1/tickets/${ticketToClose}/resolution`)
        .set(bearer(technician))
        .send({
          resolution: 'Solucionado.',
          resolutionVerification: 'Verificado.',
        });
    });

    it('el técnico que resolvió puede cerrar (sigue asignado)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketToClose}/close`)
        .set(bearer(technician))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Closed');
      expect(res.body.data.closedAt).not.toBeNull();
    });

    it('el cierre conserva el usuario responsable y la fecha', async () => {
      const audit = await request(app)
        .get(`/api/v1/audit-logs?entity=ticket&entityId=${ticketToClose}&action=ticket.status_changed`)
        .set(bearer(manager));

      const closeEvent = audit.body.data.find((e: any) => e.metadata.to === 'Closed');
      expect(closeEvent).toBeDefined();
      expect(closeEvent.actorId).toBe(2); // technician
      expect(Date.parse(closeEvent.createdAt)).not.toBeNaN();
    });
  });

  describe('reasignación transfiere el cierre (decisión 1)', () => {
    let ticketReassigned: number;

    beforeAll(async () => {
      const created = await request(app)
        .post('/api/v1/tickets')
        .set(bearer(employee))
        .send({
          title: 'Ticket reasignado FR-009',
          description: 'El técnico que resolvió pierde el cierre al reasignar.',
          categoryId: 2,
          storeLocation: 'Centro',
          motorcycleModel: 'FT150',
        });
      ticketReassigned = created.body.data.id;
      await request(app)
        .patch(`/api/v1/tickets/${ticketReassigned}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 2, expectedVersion: created.body.data.version });
      const ticket = await request(app).get(`/api/v1/tickets/${ticketReassigned}`).set(bearer(advisor));
      await request(app)
        .patch(`/api/v1/tickets/${ticketReassigned}/status`)
        .set(bearer(technician))
        .send({ status: 'In Progress', expectedVersion: ticket.body.data.version });
      await request(app)
        .post(`/api/v1/tickets/${ticketReassigned}/resolution`)
        .set(bearer(technician))
        .send({ resolution: 'Resuelto.', resolutionVerification: 'Verificado.' });
    });

    it('el técnico anterior ya no puede cerrar tras la reasignación (404)', async () => {
      // Crear un segundo técnico para reasignar
      const admin = await loginAs('admin@company.com');
      await request(app)
        .post('/api/v1/users')
        .set(bearer(admin))
        .send({
          name: 'Técnico Reasignado',
          email: 'tech2@company.com',
          password: 'ChangeMe123!',
          roles: ['Technician'],
        });

      const ticket = await request(app).get(`/api/v1/tickets/${ticketReassigned}`).set(bearer(advisor));
      const newTechId = 6; // El nuevo técnico creado arriba (id autoincremental)
      await request(app)
        .patch(`/api/v1/tickets/${ticketReassigned}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: newTechId, expectedVersion: ticket.body.data.version, reason: 'Transferencia' });

      // El técnico original intenta cerrar
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketReassigned}/close`)
        .set(bearer(technician))
        .send({});

      expect(res.status).toBe(404); // ya no tiene acceso al ticket
    });
  });

  describe('reapertura (decisión 4 y 5)', () => {
    let ticketReopened: number;

    beforeAll(async () => {
      const created = await request(app)
        .post('/api/v1/tickets')
        .set(bearer(employee))
        .send({
          title: 'Ticket para reapertura',
          description: 'Probando reapertura desde Resolved.',
          categoryId: 2,
          storeLocation: 'Centro',
          motorcycleModel: 'FT150',
        });
      ticketReopened = created.body.data.id;
      await request(app)
        .patch(`/api/v1/tickets/${ticketReopened}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 2, expectedVersion: created.body.data.version });
      const ticket = await request(app).get(`/api/v1/tickets/${ticketReopened}`).set(bearer(advisor));
      await request(app)
        .patch(`/api/v1/tickets/${ticketReopened}/status`)
        .set(bearer(technician))
        .send({ status: 'In Progress', expectedVersion: ticket.body.data.version });
      await request(app)
        .post(`/api/v1/tickets/${ticketReopened}/resolution`)
        .set(bearer(technician))
        .send({ resolution: 'Resuelto.', resolutionVerification: 'Verificado.' });
    });

    it('requiere motivo obligatorio', async () => {
      const ticket = await request(app).get(`/api/v1/tickets/${ticketReopened}`).set(bearer(advisor));
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketReopened}/reopen`)
        .set(bearer(technician))
        .send({ expectedVersion: ticket.body.data.version });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rechaza reapertura con versión antigua (409)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketReopened}/reopen`)
        .set(bearer(technician))
        .send({ reason: 'El problema reapareció.', expectedVersion: 999 });

      expect(res.status).toBe(409);
    });

    it('no se puede reabrir un ticket que no esté Resolved (409)', async () => {
      // Crear un ticket en In Progress
      const created = await request(app)
        .post('/api/v1/tickets')
        .set(bearer(employee))
        .send({
          title: 'Ticket no resuelto',
          description: 'Para probar reapertura inválida.',
          categoryId: 2,
          storeLocation: 'Centro',
          motorcycleModel: 'FT150',
        });
      await request(app)
        .patch(`/api/v1/tickets/${created.body.data.id}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 2, expectedVersion: created.body.data.version });
      const ticket = await request(app).get(`/api/v1/tickets/${created.body.data.id}`).set(bearer(advisor));
      await request(app)
        .patch(`/api/v1/tickets/${created.body.data.id}/status`)
        .set(bearer(technician))
        .send({ status: 'In Progress', expectedVersion: ticket.body.data.version });

      const res = await request(app)
        .post(`/api/v1/tickets/${created.body.data.id}/reopen`)
        .set(bearer(technician))
        .send({ reason: 'Reapertura inválida.', expectedVersion: ticket.body.data.version + 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });

    it('reabre correctamente desde Resolved y conserva la resolución previa', async () => {
      const ticket = await request(app).get(`/api/v1/tickets/${ticketReopened}`).set(bearer(advisor));
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketReopened}/reopen`)
        .set(bearer(technician))
        .send({ reason: 'El usuario reportó el mismo problema de nuevo.', expectedVersion: ticket.body.data.version });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('In Progress');
      // La resolución previa se conserva (no se borra)
      expect(res.body.data.resolution).toBe('Resuelto.');
      expect(res.body.data.resolutionVerification).toBe('Verificado.');

      // El historial incluye el evento reopened con el motivo
      const history = await request(app).get(`/api/v1/tickets/${ticketReopened}/history`).set(bearer(advisor));
      const reopenedEvent = history.body.data.find((e: any) => e.action === 'reopened');
      expect(reopenedEvent).toBeDefined();
      expect(reopenedEvent.reason).toBe('El usuario reportó el mismo problema de nuevo.');
      expect(reopenedEvent.from).toBe('Resolved');
      expect(reopenedEvent.to).toBe('In Progress');
    });

    it('la reapertura queda registrada en la auditoría con el evento ticket.reopened', async () => {
      const audit = await request(app)
        .get(`/api/v1/audit-logs?entity=ticket&entityId=${ticketReopened}&action=ticket.reopened`)
        .set(bearer(manager));

      expect(audit.status).toBe(200);
      expect(audit.body.data.length).toBeGreaterThan(0);
      expect(audit.body.data[0].metadata).toMatchObject({
        from: 'Resolved',
        to: 'In Progress',
        reason: 'El usuario reportó el mismo problema de nuevo.',
      });
    });

    it('un empleado no puede reabrir (403)', async () => {
      const ticket = await request(app).get(`/api/v1/tickets/${ticketReopened}`).set(bearer(advisor));
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketReopened}/reopen`)
        .set(bearer(employee))
        .send({ reason: 'x', expectedVersion: ticket.body.data.version });

      expect(res.status).toBe(403);
    });
  });

  describe('visibilidad para el solicitante (decisión 7)', () => {
    let ticketVisibility: number;

    beforeAll(async () => {
      const created = await request(app)
        .post('/api/v1/tickets')
        .set(bearer(employee))
        .send({
          title: 'Ticket para visibilidad',
          description: 'El solicitante no debe ver la resolución.',
          categoryId: 2,
          storeLocation: 'Centro',
          motorcycleModel: 'FT150',
        });
      ticketVisibility = created.body.data.id;
      await request(app)
        .patch(`/api/v1/tickets/${ticketVisibility}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 2, expectedVersion: created.body.data.version });
      const ticket = await request(app).get(`/api/v1/tickets/${ticketVisibility}`).set(bearer(advisor));
      await request(app)
        .patch(`/api/v1/tickets/${ticketVisibility}/status`)
        .set(bearer(technician))
        .send({ status: 'In Progress', expectedVersion: ticket.body.data.version });
      await request(app)
        .post(`/api/v1/tickets/${ticketVisibility}/resolution`)
        .set(bearer(technician))
        .send({
          resolution: 'Resolución interna confidencial.',
          resolutionVerification: 'Comprobada.',
          rootCause: 'Causa interna.',
        });
    });

    it('el solicitante ve el estado Resolved pero no el contenido de la resolución', async () => {
      const res = await request(app)
        .get(`/api/v1/me/tickets/${ticketVisibility}`)
        .set(bearer(employee));

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Resolved');
      expect(res.body.data.resolvedAt).not.toBeNull();
      // Decisión 7: la resolución es interna
      expect(res.body.data).not.toHaveProperty('resolution');
      expect(res.body.data).not.toHaveProperty('resolutionVerification');
      expect(res.body.data).not.toHaveProperty('rootCause');
      expect(res.body.data).not.toHaveProperty('resolutionObservations');
      expect(res.body.data).not.toHaveProperty('knowledgeArticleId');
    });

    it('el solicitante no ve el texto confidencial en la respuesta', async () => {
      const res = await request(app)
        .get(`/api/v1/me/tickets/${ticketVisibility}`)
        .set(bearer(employee));

      const text = JSON.stringify(res.body);
      expect(text).not.toContain('Resolución interna confidencial');
      expect(text).not.toContain('Causa interna');
    });
  });
});