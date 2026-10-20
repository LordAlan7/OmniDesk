import request from 'supertest';
import { app, bearer, loginAs } from '../../test-helpers';

const newArticle = {
  title: 'Error de conexión a la base de datos',
  problemDescription: 'El servidor no puede conectar con PostgreSQL.',
  solution: 'Revisar el archivo .env y reiniciar el servicio.',
  categoryId: 1,
};

describe('FR-011 - Knowledge Base', () => {
  let techToken: string;
  let managerToken: string;
  let employeeToken: string;
  let articleId: number;
  let articleVersion: number;

  beforeAll(async () => {
    techToken = await loginAs('technician@company.com');
    managerToken = await loginAs('manager@company.com');
    employeeToken = await loginAs('employee@company.com');
  });

  it('technician can create a draft article', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/articles')
      .set(bearer(techToken))
      .send(newArticle);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft'); // Recién creado es borrador
    articleId = res.body.data.id;
    articleVersion = res.body.data.version;
  });

  it('employee cannot create an article (403)', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/articles')
      .set(bearer(employeeToken))
      .send(newArticle);

    expect(res.status).toBe(403);
  });

  it('employee cannot see the draft in search results', async () => {
    const res = await request(app)
      .get('/api/v1/knowledge/articles')
      .set(bearer(employeeToken));

    expect(res.status).toBe(200);
    // El borrador no debe aparecer para el empleado
    expect(res.body.data.length).toBe(0);
  });

  it('manager can approve the article', async () => {
    const res = await request(app)
      .patch(`/api/v1/knowledge/articles/${articleId}/status`)
      .set(bearer(managerToken))
      .send({ status: 'approved', version: articleVersion });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    articleVersion = res.body.data.version;
  });

  it('employee can now see the approved article', async () => {
    const res = await request(app)
      .get('/api/v1/knowledge/articles')
      .set(bearer(employeeToken));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].title).toBe(newArticle.title);
  });

  it('technician edits the article, it goes back to draft', async () => {
    const res = await request(app)
      .patch(`/api/v1/knowledge/articles/${articleId}`)
      .set(bearer(techToken))
      .send({ 
        solution: 'Revisar el .env, reiniciar y verificar credenciales.',
        version: articleVersion 
      });

    expect(res.status).toBe(200);
    // Al ser editado por un técnico (no manager), vuelve a borrador
    expect(res.body.data.status).toBe('draft'); 
  });
});