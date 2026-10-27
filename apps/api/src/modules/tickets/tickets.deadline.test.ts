import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';
import { isOverdue } from './tickets.deadline';

const FUTURE = '2099-01-01T12:00:00.000Z';
const FUTURE_2 = '2099-06-01T12:00:00.000Z';

describe('FR-008 isOverdue', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const past = '2026-10-20T12:00:00.000Z';

  it('a ticket without deadline is never overdue', () => {
    expect(isOverdue({ dueDate: null, status: 'In Progress' }, now)).toBe(false);
  });

  it('is overdue when the deadline passed and the ticket is still open for work', () => {
    for (const status of ['Open', 'Assigned', 'In Progress'] as const) {
      expect(isOverdue({ dueDate: past, status }, now)).toBe(true);
    }
  });

  it('stops counting once resolved or closed, and a reopen counts again', () => {
    expect(isOverdue({ dueDate: past, status: 'Resolved' }, now)).toBe(false);
    expect(isOverdue({ dueDate: past, status: 'Closed' }, now)).toBe(false);
    expect(isOverdue({ dueDate: past, status: 'In Progress' }, now)).toBe(true);
  });

  it('a future deadline is not overdue', () => {
    expect(isOverdue({ dueDate: FUTURE, status: 'Assigned' }, now)).toBe(false);
  });
});

describe.skip('FR-008 tracking endpoints', () => {
  let employee: string;
  let advisor: string;
  let technician: string;
  let manager: string;
  let ticketId: number;
  const url = (suffix = '') => `/api/v1/tickets/${ticketId}${suffix}`;

  const get = async (token = advisor) =>
    (await request(app).get(url()).set(bearer(token))).body.data;

  beforeAll(async () => {
    employee = await loginAs('employee@company.com');
    advisor = await loginAs('advisor@company.com');
    technician = await loginAs('technician@company.com');
    manager = await loginAs('manager@company.com');

    const created = await request(app).post('/api/v1/tickets').set(bearer(employee)).send({
      title: 'Seguimiento de plazo',
      description: 'Ticket para FR-008.',
      categoryId: 2,
      storeLocation: 'Sucursal Centro',
      motorcycleModel: 'Italika FT150',
    });
    ticketId = created.body.data.id;

    const ticket = await get();
    await request(app)
      .patch(url('/assignment'))
      .set(bearer(advisor))
      .send({ technicianId: 2, expectedVersion: ticket.version });
  });

  it('shows "no deadline" and not overdue by default', async () => {
    const ticket = await get();
    expect(ticket.dueDate).toBeNull();
    expect(ticket.isOverdue).toBe(false);
  });

  it('exposes only the transitions the user may run', async () => {
    const forTech = await request(app).get(url('/available-transitions')).set(bearer(technician));
    expect(forTech.status).toBe(200);
    expect(forTech.body.data).toEqual([{ to: 'In Progress', via: 'status' }]);

    const forEmployee = await request(app).get(url('/available-transitions')).set(bearer(employee));
    expect(forEmployee.body.data).toEqual([]);

    expect((await request(app).get(url('/available-transitions'))).status).toBe(401);
  });

  it('requires the permission, a reason, a future date and a current version to set the deadline', async () => {
    const { version } = await get();
    const send = (token: string, body: object) =>
      request(app).patch(url('/deadline')).set(bearer(token)).send(body);

    expect((await send(technician, { dueDate: FUTURE, expectedVersion: version, reason: 'x' })).status).toBe(403);
    expect((await send(manager, { dueDate: FUTURE, expectedVersion: version, reason: 'x' })).status).toBe(403);
    expect((await send(advisor, { dueDate: FUTURE, expectedVersion: version })).status).toBe(400);
    expect((await send(advisor, { dueDate: 'mañana', expectedVersion: version, reason: 'x' })).status).toBe(400);
    expect(
      (await send(advisor, { dueDate: '2020-01-01T00:00:00.000Z', expectedVersion: version, reason: 'x' })).status,
    ).toBe(400);
    expect((await send(advisor, { dueDate: FUTURE, expectedVersion: version + 5, reason: 'x' })).status).toBe(409);
    expect((await request(app).patch(url('/deadline')).send({})).status).toBe(401);
  });

  it('sets the deadline atomically with a history event and does not touch other fields', async () => {
    const before = await get();
    const res = await request(app)
      .patch(url('/deadline'))
      .set(bearer(advisor))
      .send({ dueDate: FUTURE, expectedVersion: before.version, reason: 'Acordado con el cliente' });

    expect(res.status).toBe(200);
    expect(res.body.data.dueDate).toBe(FUTURE);
    expect(res.body.data.isOverdue).toBe(false);
    expect(res.body.data.status).toBe(before.status);
    expect(res.body.data.priorityId).toBe(before.priorityId);
    expect(res.body.data.assignedTechnicianId).toBe(before.assignedTechnicianId);
    expect(res.body.data.categoryId).toBe(before.categoryId);

    const history = (await request(app).get(url('/history')).set(bearer(advisor))).body.data;
    const event = history.find((h: { action: string }) => h.action === 'deadline_changed');
    expect(event).toMatchObject({ from: null, to: FUTURE, reason: 'Acordado con el cliente' });
    expect(event.actorId).toBe(4 - 1); // advisor
  });

  it('does not create a fake event when the same deadline is sent again', async () => {
    const before = await get();
    const historyBefore = (await request(app).get(url('/history')).set(bearer(advisor))).body.data;

    const res = await request(app)
      .patch(url('/deadline'))
      .set(bearer(advisor))
      .send({ dueDate: FUTURE, expectedVersion: before.version, reason: 'igual' });

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(before.version);
    const historyAfter = (await request(app).get(url('/history')).set(bearer(advisor))).body.data;
    expect(historyAfter).toHaveLength(historyBefore.length);
  });

  it('keeps the previous value when the deadline is modified', async () => {
    const before = await get();
    await request(app)
      .patch(url('/deadline'))
      .set(bearer(advisor))
      .send({ dueDate: FUTURE_2, expectedVersion: before.version, reason: 'Reprogramado' });

    const history = (await request(app).get(url('/history')).set(bearer(advisor))).body.data;
    const events = history.filter((h: { action: string }) => h.action === 'deadline_changed');
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ from: FUTURE, to: FUTURE_2, reason: 'Reprogramado' });
  });

  it('technician registers progress notes; the employee never sees them', async () => {
    const res = await request(app)
      .post(url('/progress-updates'))
      .set(bearer(technician))
      .send({ note: 'Se revisó la refacción, falta pieza.' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ action: 'progress_update', actorId: 2 });

    expect((await request(app).post(url('/progress-updates')).set(bearer(employee)).send({ note: 'x' })).status).toBe(403);
    expect((await request(app).post(url('/progress-updates')).set(bearer(technician)).send({ note: '  ' })).status).toBe(400);

    const internal = (await request(app).get(url('/history')).set(bearer(technician))).body.data;
    expect(internal.some((h: { action: string }) => h.action === 'progress_update')).toBe(true);

    const own = (await request(app).get(url('/history')).set(bearer(employee))).body.data;
    expect(JSON.stringify(own)).not.toContain('falta pieza');
    const ownTicket = (await request(app).get(url()).set(bearer(employee))).body.data;
    expect(JSON.stringify(ownTicket)).not.toContain('falta pieza');
  });

  it('rejects invalid transitions straight from the API and rejects stale versions', async () => {
    const direct = await request(app).patch(url('/status')).set(bearer(technician)).send({ status: 'Closed' });
    expect(direct.status).toBe(400);

    const stale = await request(app)
      .patch(url('/status'))
      .set(bearer(technician))
      .send({ status: 'In Progress', expectedVersion: 1 });
    expect(stale.status).toBe(409);

    const ok = await request(app)
      .patch(url('/status'))
      .set(bearer(technician))
      .send({ status: 'In Progress', expectedVersion: (await get()).version });
    expect(ok.status).toBe(200);

    const same = await request(app).patch(url('/status')).set(bearer(technician)).send({ status: 'In Progress' });
    expect(same.status).toBe(409);
  });

  it('filters by overdue within the user scope', async () => {
    const mine = await request(app).get('/api/v1/tickets?overdue=false').set(bearer(advisor));
    expect(mine.status).toBe(200);
    expect(mine.body.data.some((t: { id: number }) => t.id === ticketId)).toBe(true);

    const overdue = await request(app).get('/api/v1/tickets?overdue=true').set(bearer(advisor));
    expect(overdue.body.data.some((t: { id: number }) => t.id === ticketId)).toBe(false);

    expect((await request(app).get('/api/v1/tickets?overdue=maybe').set(bearer(advisor))).status).toBe(400);
  });

  it('refuses deadline and progress changes on closed tickets', async () => {
    await request(app).post(url('/resolution')).set(bearer(technician)).send({
      resolution: 'Pieza reemplazada.',
      resolutionVerification: 'Confirmé con el usuario que el problema se resolvió.',
    });
    await request(app).post(url('/close')).set(bearer(advisor)).send({});

    const { version, status } = await get();
    expect(status).toBe('Closed');
    expect(
      (await request(app).patch(url('/deadline')).set(bearer(advisor)).send({ dueDate: FUTURE, expectedVersion: version, reason: 'x' })).status,
    ).toBe(409);
    expect((await request(app).post(url('/progress-updates')).set(bearer(advisor)).send({ note: 'x' })).status).toBe(409);
  });
});
