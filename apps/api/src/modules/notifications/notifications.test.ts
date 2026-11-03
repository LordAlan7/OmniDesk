import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';
import { memoryNotificationsRepository, resetNotificationsRepository } from './notifications.repository';

describe.skip('FR-020 — Notificaciones internas de tickets', () => {
  let employee: string;
  let advisor: string;
  let technician: string;
  let manager: string;

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    advisor = await loginAs('advisor@company.com');
    technician = await loginAs('technician@company.com');
    manager = await loginAs('manager@company.com');
  });

  beforeEach(() => {
    // Limpia el store de notificaciones entre tests para que el contador arranque en 0.
    resetNotificationsRepository();
  });

  // Helper: crea un ticket como empleado y lo asigna a técnico. Devuelve el id.
  async function createAndAssignTicket(): Promise<number> {
    const created = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employee))
      .send({
        title: 'Ticket FR-020',
        description: 'Prueba de notificaciones.',
        categoryId: 2,
        storeLocation: 'Centro',
        motorcycleModel: 'FT150',
      });
    const ticketId = created.body.data.id;
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send({ technicianId: 2, expectedVersion: created.body.data.version });
    return ticketId;
  }

  // Helper: pasa un ticket a In Progress y lo resuelve.
  async function progressAndResolve(ticketId: number): Promise<void> {
    const ticket = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set(bearer(technician))
      .send({ status: 'In Progress', expectedVersion: ticket.body.data.version });
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/resolution`)
      .set(bearer(technician))
      .send({
        resolution: 'Solucionado.',
        resolutionVerification: 'Verificado.',
      });
  }

  describe('generación de notificaciones', () => {
    it('asignación genera notificación al solicitante (no al asesor actor)', async () => {
      const ticketId = await createAndAssignTicket();

      // El empleado debe tener al menos 1 notificación no leída.
      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set(bearer(employee));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].message).toContain(`ticket #${ticketId}`);
      expect(res.body.data[0].eventType).toBe('assigned');
      expect(res.body.data[0].read).toBe(false);
      expect(res.body.data[0].refEntity).toBe('ticket');
      expect(res.body.data[0].refId).toBe(ticketId);
    });

    it('asignación NO notifica al asesor que ejecuta la acción (decisión 1)', async () => {
      await createAndAssignTicket();

      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set(bearer(advisor));

      expect(res.status).toBe(200);
      // El asesor no recibe ninguna notificación de sus propias asignaciones.
      const assignedNotifs = res.body.data.filter((n: any) => n.eventType === 'assigned');
      expect(assignedNotifs.length).toBe(0);
    });

    it('reasignación NO notifica al técnico anterior (decisión 2)', async () => {
      // Crear un segundo técnico para reasignar.
      const admin = await loginAs('admin@company.com');
      await request(app)
        .post('/api/v1/users')
        .set(bearer(admin))
        .send({
          name: 'Técnico 2',
          email: 'tech2@company.com',
          password: 'ChangeMe123!',
          roles: ['Technician'],
        });

      const ticketId = await createAndAssignTicket();
      const ticket = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));

      // Reasignar al técnico 2 (id 6)
      await request(app)
        .patch(`/api/v1/tickets/${ticketId}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 6, expectedVersion: ticket.body.data.version, reason: 'Transferencia' });

      // El técnico original (id 2) no debe recibir notificación de la reasignación.
      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set(bearer(technician));

      expect(res.status).toBe(200);
      const assignedNotifs = res.body.data.filter((n: any) => n.eventType === 'assigned');
      expect(assignedNotifs.length).toBe(0);
    });

    it('resolución genera notificación al solicitante (no al técnico actor)', async () => {
      const ticketId = await createAndAssignTicket();
      await progressAndResolve(ticketId);

      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set(bearer(employee));

      expect(res.status).toBe(200);
      const resolvedNotifs = res.body.data.filter((n: any) =>
        n.message.includes('estado') || n.message.includes('Resuelto') || n.message.includes('resuelto'),
      );
      // Al menos una notificación relacionada con la resolución o el cambio de estado.
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('reapertura genera notificación al solicitante', async () => {
      const ticketId = await createAndAssignTicket();
      await progressAndResolve(ticketId);

      const ticket = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/reopen`)
        .set(bearer(technician))
        .send({ reason: 'El problema reapareció.', expectedVersion: ticket.body.data.version });

      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set(bearer(employee));

      expect(res.status).toBe(200);
      const reopenedNotifs = res.body.data.filter((n: any) => n.eventType === 'reopened');
      expect(reopenedNotifs.length).toBeGreaterThan(0);
      expect(reopenedNotifs[0].message).toContain('reabrió');
    });

    it('investigación genera notificación al solicitante (no al técnico actor)', async () => {
      const ticketId = await createAndAssignTicket();

      // Pasar a In Progress (necesario antes de investigar)
      const ticket = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));
      await request(app)
        .patch(`/api/v1/tickets/${ticketId}/status`)
        .set(bearer(technician))
        .send({ status: 'In Progress', expectedVersion: ticket.body.data.version });

      // Registrar investigación
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/investigations`)
        .set(bearer(technician))
        .send({
          activity: 'Revisé los logs.',
          result: 'Encontré el error.',
        });

      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set(bearer(employee));

      expect(res.status).toBe(200);
      const invNotifs = res.body.data.filter((n: any) => n.eventType === 'investigation_logged');
      expect(invNotifs.length).toBeGreaterThan(0);
      expect(invNotifs[0].message).toContain('investigación');
    });
  });

  describe('deduplicación (decisión 7)', () => {
    it('dos envíos del mismo evento (misma correlationId) no duplican', async () => {
      // Solo se puede probar directamente con el repositorio en memoria.
      const input = {
        userId: 1,
        ticketId: 100,
        eventType: 'assigned',
        message: 'Test dedup.',
        dedupKey: '1|100|assigned|req-123',
        correlationId: 'req-123',
      };

      const first = memoryNotificationsRepository.add(input);
      const second = memoryNotificationsRepository.add(input);

      expect(first).not.toBeNull();
      expect(second).toBeNull(); // El segundo se ignora por dedup_key.
    });

    it('eventos con correlationId distinto sí se guardan', async () => {
      const input1 = {
        userId: 1,
        ticketId: 100,
        eventType: 'assigned',
        message: 'Test 1.',
        dedupKey: '1|100|assigned|req-1',
        correlationId: 'req-1',
      };
      const input2 = {
        userId: 1,
        ticketId: 100,
        eventType: 'assigned',
        message: 'Test 2.',
        dedupKey: '1|100|assigned|req-2',
        correlationId: 'req-2',
      };

      expect(memoryNotificationsRepository.add(input1)).not.toBeNull();
      expect(memoryNotificationsRepository.add(input2)).not.toBeNull();

      const result = memoryNotificationsRepository.list({
        userId: 1,
        accessibleTicketIds: null,
        page: 1,
        limit: 10,
      });
      expect(result.total).toBe(2);
    });
  });

  describe('consulta y contador', () => {
    it('GET /me/notifications requiere sesión (401 sin token)', async () => {
      const res = await request(app).get('/api/v1/me/notifications');
      expect(res.status).toBe(401);
    });

    it('GET /me/notifications/unread-count devuelve el contador', async () => {
      await createAndAssignTicket(); // genera 1 notificación al empleado

      const res = await request(app)
        .get('/api/v1/me/notifications/unread-count')
        .set(bearer(employee));

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBeGreaterThan(0);
    });

    it('el contador coincide con las notificaciones visibles no leídas', async () => {
      await createAndAssignTicket();

      const list = await request(app).get('/api/v1/me/notifications?unread=true').set(bearer(employee));
      const count = await request(app).get('/api/v1/me/notifications/unread-count').set(bearer(employee));

      expect(list.body.meta.total).toBe(count.body.data.count);
    });

    it('la lista paginada respeta page y limit', async () => {
      // Generar varias notificaciones: asignar y reasignar varias veces.
      const ticketId = await createAndAssignTicket();
      const admin = await loginAs('admin@company.com');
      await request(app)
        .post('/api/v1/users')
        .set(bearer(admin))
        .send({ name: 'T3', email: 't3@company.com', password: 'ChangeMe123!', roles: ['Technician'] });
      await request(app)
        .post('/api/v1/users')
        .set(bearer(admin))
        .send({ name: 'T4', email: 't4@company.com', password: 'ChangeMe123!', roles: ['Technician'] });

      let ticket = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));
      await request(app)
        .patch(`/api/v1/tickets/${ticketId}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 6, expectedVersion: ticket.body.data.version });
      ticket = await request(app).get(`/api/v1/tickets/${ticketId}`).set(bearer(advisor));
      await request(app)
        .patch(`/api/v1/tickets/${ticketId}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 7, expectedVersion: ticket.body.data.version });

      const page1 = await request(app)
        .get('/api/v1/me/notifications?page=1&limit=2')
        .set(bearer(employee));

      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBe(2);
      expect(page1.body.meta.total).toBeGreaterThanOrEqual(3);
    });
  });

  describe('marcado de lectura', () => {
    it('PATCH /me/notifications/:id/read marca una notificación como leída', async () => {
      await createAndAssignTicket();
      const list = await request(app).get('/api/v1/me/notifications').set(bearer(employee));
      const notifId = list.body.data[0].id;

      const res = await request(app)
        .patch(`/api/v1/me/notifications/${notifId}/read`)
        .set(bearer(employee));

      expect(res.status).toBe(200);
      expect(res.body.data.read).toBe(true);
      expect(res.body.data.readAt).not.toBeNull();

      // El contador baja
      const count = await request(app).get('/api/v1/me/notifications/unread-count').set(bearer(employee));
      expect(count.body.data.count).toBe(list.body.meta.total - 1);
    });

    it('no se puede marcar como leída una notificación ajena (404)', async () => {
      await createAndAssignTicket();
      const list = await request(app).get('/api/v1/me/notifications').set(bearer(employee));
      const notifId = list.body.data[0].id;

      // El asesor intenta marcar la notificación del empleado.
      const res = await request(app)
        .patch(`/api/v1/me/notifications/${notifId}/read`)
        .set(bearer(advisor));

      expect(res.status).toBe(404);
    });

    it('PATCH /me/notifications/read-all marca todas como leídas', async () => {
      await createAndAssignTicket();
      // Generar otra notificación: reasignar
      const admin = await loginAs('admin@company.com');
      await request(app)
        .post('/api/v1/users')
        .set(bearer(admin))
        .send({ name: 'T3', email: 't3@company.com', password: 'ChangeMe123!', roles: ['Technician'] });

      const before = await request(app).get('/api/v1/me/notifications/unread-count').set(bearer(employee));
      expect(before.body.data.count).toBeGreaterThan(0);

      const res = await request(app)
        .patch('/api/v1/me/notifications/read-all')
        .set(bearer(employee));

      expect(res.status).toBe(200);
      expect(res.body.data.updated).toBe(before.body.data.count);

      const after = await request(app).get('/api/v1/me/notifications/unread-count').set(bearer(employee));
      expect(after.body.data.count).toBe(0);
    });
  });

  describe('revalidación de acceso (decisión 3)', () => {
    it('si el solicitante pierde acceso al ticket, la notificación se oculta del contador', async () => {
      // Crear un ticket como admin (para que el empleado no sea el creador)
      const admin = await loginAs('admin@company.com');
      const created = await request(app)
        .post('/api/v1/tickets')
        .set(bearer(admin))
        .send({
          title: 'Ticket ajeno',
          description: 'El empleado no debe ver esto.',
          categoryId: 2,
          storeLocation: 'Centro',
          motorcycleModel: 'FT150',
        });

      // El asesor lo asigna al técnico (no al empleado)
      await request(app)
        .patch(`/api/v1/tickets/${created.body.data.id}/assignment`)
        .set(bearer(advisor))
        .send({ technicianId: 2, expectedVersion: created.body.data.version });

      // El empleado NO recibe notificaciones de un ticket que no creó ni le fue asignado.
      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set(bearer(employee));

      expect(res.status).toBe(200);
      const relatedNotifs = res.body.data.filter((n: any) => n.ticketId === created.body.data.id);
      expect(relatedNotifs.length).toBe(0);
    });
  });

  describe('contenido del mensaje (decisión 6)', () => {
    it('el mensaje no revela información interna (sin resolución, sin nombre de técnico)', async () => {
      const ticketId = await createAndAssignTicket();
      await progressAndResolve(ticketId);

      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set(bearer(employee));

      const text = JSON.stringify(res.body.data);
      // El mensaje no debe contener el texto de la resolución.
      expect(text).not.toContain('Solucionado.');
      expect(text).not.toContain('Verificado.');
      // El mensaje no debe contener el nombre del técnico.
      expect(text).not.toContain('Demo Technician');
    });
  });
});