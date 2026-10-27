import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

describe('FR-019 - Recurring Problems', () => {
  let technicianToken: string;
  let advisorToken: string;
  let ticketId: number;
  let articleId: number;
  let articleVersion: number;

  beforeAll(async () => {
    advisorToken = await loginAs('advisor@company.com');
    technicianToken = await loginAs('technician@company.com');

    // Crear un ticket
    const employeeToken = await loginAs('employee@company.com');
    const ticketRes = await request(app)
      .post('/api/v1/tickets')
      .set(bearer(employeeToken))
      .send({
        title: 'Falla de red en tienda',
        description: 'No hay internet',
        categoryId: 4,
        storeLocation: 'Sucursal Norte',
        motorcycleModel: 'Italika FT150',
      });
    ticketId = ticketRes.body.data.id;

    // Crear un artículo recurrente
    const articleRes = await request(app)
      .post('/api/v1/knowledge/articles')
      .set(bearer(advisorToken))
      .send({
        title: 'Reinicio de router',
        problemDescription: 'El router se queda colgado y hay que reiniciarlo.',
        solution: 'Apagar, esperar 30 segundos y encender.',
        categoryId: 4,
        isRecurringProblem: true,
        symptoms: 'Sin internet, luz roja en el router.',
        verification: 'El router tiene luz verde y hay internet.',
      });
    articleId = articleRes.body.data.id;
    articleVersion = articleRes.body.data.version;

    // Aprobar el artículo para que sea visible
    await request(app)
      .patch(`/api/v1/knowledge/articles/${articleId}/status`)
      .set(bearer(await loginAs('manager@company.com')))
      .send({ status: 'approved', version: articleVersion });
  });

  it('technician can link a recurring problem to a ticket', async () => {
    // Primero asignar el ticket al técnico
    const advisor = await loginAs('advisor@company.com');
    const ticket = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set(bearer(advisor));
    
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignment`)
      .set(bearer(advisor))
      .send({ technicianId: 2, expectedVersion: ticket.body.data.version });

    // Ahora vincular
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/recurring-problems`)
      .set(bearer(technicianToken))
      .send({ articleId });

    expect(res.status).toBe(201);
    expect(res.body.data).toContain(articleId);
  });

  it('rejects linking a non-recurring article', async () => {
    // Crear un artículo normal (sin isRecurringProblem)
    const normalArticle = await request(app)
      .post('/api/v1/knowledge/articles')
      .set(bearer(advisorToken))
      .send({
        title: 'Cómo cambiar contraseña',
        problemDescription: 'El usuario olvidó su contraseña.',
        solution: 'Usar el formulario de recuperación.',
        categoryId: 1,
        isRecurringProblem: false,
      });

    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/recurring-problems`)
      .set(bearer(technicianToken))
      .send({ articleId: normalArticle.body.data.id });

    expect(res.status).toBe(400);
  });

  it('rejects duplicate links', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/recurring-problems`)
      .set(bearer(technicianToken))
      .send({ articleId });

    expect(res.status).toBe(409);
  });

  it('lists linked recurring problems', async () => {
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}/recurring-problems`)
      .set(bearer(technicianToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toContain(articleId);
  });

  it('can unlink a recurring problem', async () => {
    const res = await request(app)
      .delete(`/api/v1/tickets/${ticketId}/recurring-problems/${articleId}`)
      .set(bearer(technicianToken));

    expect(res.status).toBe(200);
    expect(res.body.data).not.toContain(articleId);
  });
});