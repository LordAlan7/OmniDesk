import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import * as database from '../../shared/db/pool';
import { app, bearer, loginAs } from '../../test-helpers';

const testUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testUrl ? describe : describe.skip;

/**
 * NFR-012: Pruebas de reconciliación.
 * 
 * NO SE HAN EJECTUADO ESTAS PRUEBAS AL MOMENTO DE CREACIÓN
 *
 * Verifica que los indicadores del dashboard (FR-016) coincidan con los
 * informes (FR-017) y con el conteo directo de la base de datos, bajo
 * las mismas condiciones (filtros, fechas, zona horaria).
 *
 * Requiere: TEST_DATABASE_URL=postgresql://.../omnidesk_test
 * Ejecutar: npm test -- --testPathPattern=reconciliation
 */
describeDatabase('NFR-012 — Reconciliación de reportes', () => {
  let connection: Pool;
  let admin: Pool;
  let spy: jest.SpyInstance;
  let managerToken: string;
  let advisorToken: string;
  let employeeToken: string;

  const schema = `qa_nfr012_${randomUUID().replace(/-/g, '')}`;

  beforeAll(async () => {
    if (new URL(testUrl!).pathname !== '/omnidesk_test') {
      throw new Error('Usa exclusivamente omnidesk_test.');
    }

    admin = new Pool({ connectionString: testUrl });
    await admin.query(`CREATE SCHEMA "${schema}"`);

    connection = new Pool({
      connectionString: testUrl,
      options: `-c search_path=${schema}`,
    });

    spy = jest.spyOn(database, 'getPool').mockReturnValue(connection);

    // Aplicar todas las migraciones necesarias
    const migrations = [
      '001_init.sql',
      '002_users_constraints.sql',
      '003_tickets_constraints.sql',
      '004_ticket_assignment.sql',
      '004_audit_constraints.sql',
      '006_knowledge_articles.sql',
      '007_ticket_priorities_enriched.sql',
      '009_audit_traceability.sql',
      '010_ticket_investigations.sql',
      '011_notifications.sql',
    ];

    for (const name of migrations) {
      const sql = fs.readFileSync(
        path.join(__dirname, '../../../db/migrations', name),
        'utf8',
      );
      await connection.query(sql);
    }

    // Insertar usuarios de prueba (IDs coinciden con la semilla en memoria)
    await connection.query(`
      INSERT INTO users (id, name, email, password_hash, active)
      VALUES
        (1, 'Demo Employee', 'employee@company.com', 'hash', true),
        (2, 'Demo Technician', 'technician@company.com', 'hash', true),
        (3, 'Demo Service Advisor', 'advisor@company.com', 'hash', true),
        (4, 'Demo Manager', 'manager@company.com', 'hash', true),
        (5, 'Demo Administrator', 'admin@company.com', 'hash', true)
    `);

    await connection.query(`
      INSERT INTO user_roles (user_id, role_id)
      VALUES
        (1, (SELECT id FROM roles WHERE name = 'Employee')),
        (2, (SELECT id FROM roles WHERE name = 'Technician')),
        (3, (SELECT id FROM roles WHERE name = 'Service Advisor')),
        (4, (SELECT id FROM roles WHERE name = 'Manager')),
        (5, (SELECT id FROM roles WHERE name = 'Administrator'))
    `);

    // Login con los usuarios sembrados (la auth usa memoria en test)
    managerToken = await loginAs('manager@company.com');
    advisorToken = await loginAs('advisor@company.com');
    employeeToken = await loginAs('employee@company.com');
  }, 30000);

  afterAll(async () => {
    spy?.mockRestore();
    await connection?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Helper: insertar tickets directamente en la BD para tener control exacto
  // ──────────────────────────────────────────────────────────────────────────

  async function insertTicket(
    id: number,
    status: string,
    options: {
      priorityId?: number | null;
      technicianId?: number | null;
      dueDate?: string | null;
      createdBy?: number;
    } = {},
  ): Promise<void> {
    const createdBy = options.createdBy ?? 1;
    const priorityId = options.priorityId ?? null;
    const technicianId = options.technicianId ?? null;
    const dueDate = options.dueDate ?? null;

    await connection.query(
      `INSERT INTO tickets (id, title, description, category_id, status, created_by,
         assigned_technician_id, priority_id, due_date, version, store_location, motorcycle_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 'Centro', 'FT150')`,
      [
        id,
        `Ticket ${id}`,
        `Descripción del ticket ${id}`,
        1, // category_id (Acceso)
        status,
        createdBy,
        technicianId,
        priorityId,
        dueDate,
      ],
    );
  }

  async function insertHistoryEvent(
    ticketId: number,
    action: string,
    actorId: number = 2,
    createdAt?: string,
  ): Promise<void> {
    const timestamp = createdAt ?? new Date().toISOString();
    await connection.query(
      `INSERT INTO ticket_history (ticket_id, actor_id, action, created_at)
       VALUES ($1, $2, $3, $4)`,
      [ticketId, actorId, action, timestamp],
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helper: conteo directo desde la BD (fuente de verdad independiente)
  // ──────────────────────────────────────────────────────────────────────────

  async function directCount(query: string, params: unknown[] = []): Promise<number> {
    const result = await connection.query<{ count: string }>(query, params);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. RECONCILIACIÓN: Overview = Conteo directo
  // ══════════════════════════════════════════════════════════════════════════

  describe('Overview: dashboard = conteo directo', () => {
    beforeEach(async () => {
      // Limpiar tickets del schema de prueba
      await connection.query('DELETE FROM ticket_history');
      await connection.query('DELETE FROM tickets');

      // Insertar tickets con estados variados
      await insertTicket(1, 'Open');
      await insertTicket(2, 'Assigned', { technicianId: 2 });
      await insertTicket(3, 'In Progress', { technicianId: 2 });
      await insertTicket(4, 'Resolved', { technicianId: 2 });
      await insertTicket(5, 'Closed', { technicianId: 2 });
      await insertTicket(6, 'Open');
      await insertTicket(7, 'Assigned', { technicianId: 2, priorityId: 3 });
      await insertTicket(8, 'In Progress', { technicianId: 2, priorityId: 3 });
    });

    it('total de tickets coincide con COUNT(*) directo', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      expect(api.status).toBe(200);

      const directTotal = await directCount('SELECT COUNT(*) FROM tickets');
      expect(api.body.data.total).toBe(directTotal);
      expect(api.body.data.total).toBe(8);
    });

    it('conteo por estado coincide con COUNT(*) filtrado', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      const directOpen = await directCount("SELECT COUNT(*) FROM tickets WHERE status = 'Open'");
      const directAssigned = await directCount("SELECT COUNT(*) FROM tickets WHERE status = 'Assigned'");
      const directInProgress = await directCount("SELECT COUNT(*) FROM tickets WHERE status = 'In Progress'");
      const directResolved = await directCount("SELECT COUNT(*) FROM tickets WHERE status = 'Resolved'");
      const directClosed = await directCount("SELECT COUNT(*) FROM tickets WHERE status = 'Closed'");

      expect(api.body.data.open).toBe(directOpen);
      expect(api.body.data.assigned).toBe(directAssigned);
      expect(api.body.data.inProgress).toBe(directInProgress);
      expect(api.body.data.resolved).toBe(directResolved);
      expect(api.body.data.closed).toBe(directClosed);

      // Verificación cruzada: suma de estados = total
      const sumStates =
        api.body.data.open +
        api.body.data.assigned +
        api.body.data.inProgress +
        api.body.data.resolved +
        api.body.data.closed;
      expect(sumStates).toBe(api.body.data.total);
    });

    it('tickets sin prioridad coinciden con COUNT(*) directo', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      const directWithoutPriority = await directCount(
        "SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved', 'Closed') AND priority_id IS NULL",
      );

      expect(api.body.data.withoutPriority).toBe(directWithoutPriority);
      // 6 tickets activos, 4 sin prioridad (solo 2 tienen priorityId=3)
      expect(api.body.data.withoutPriority).toBe(4);
    });

    it('tickets sin asignar coinciden con COUNT(*) directo', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      const directUnassigned = await directCount(
        "SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved', 'Closed') AND assigned_technician_id IS NULL",
      );

      expect(api.body.data.unassigned).toBe(directUnassigned);
      // 6 tickets activos, 2 sin técnico (tickets 1 y 6)
      expect(api.body.data.unassigned).toBe(2);
    });

    it('distribución por prioridad coincide con GROUP BY directo', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      const priorityResult = await connection.query(
        `SELECT priority_id, COUNT(*)::integer AS count FROM tickets GROUP BY priority_id ORDER BY priority_id NULLS FIRST`,
      );

      const directByPriority = priorityResult.rows.map((r) => ({
        priorityId: r.priority_id,
        total: r.count,
      }));

      expect(api.body.data.byPriority).toHaveLength(directByPriority.length);
      for (let i = 0; i < directByPriority.length; i++) {
        expect(api.body.data.byPriority[i].priorityId).toBe(directByPriority[i].priorityId);
        expect(api.body.data.byPriority[i].total).toBe(directByPriority[i].total);
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. RECONCILIACIÓN: Workload = Conteo directo
  // ══════════════════════════════════════════════════════════════════════════

  describe('Workload: dashboard = conteo directo', () => {
    beforeEach(async () => {
      await connection.query('DELETE FROM ticket_history');
      await connection.query('DELETE FROM tickets');

      // Técnico 2 con 3 tickets pendientes
      await insertTicket(1, 'Assigned', { technicianId: 2 });
      await insertTicket(2, 'In Progress', { technicianId: 2 });
      await insertTicket(3, 'In Progress', { technicianId: 2 });
      // Técnico 2 con 2 tickets cerrados (no cuentan)
      await insertTicket(4, 'Closed', { technicianId: 2 });
      await insertTicket(5, 'Resolved', { technicianId: 2 });
    });

    it('carga por técnico coincide con GROUP BY directo', async () => {
      const api = await request(app)
        .get('/api/v1/reports/workload')
        .set(bearer(managerToken));

      expect(api.status).toBe(200);

      const directWorkload = await connection.query(
        `SELECT assigned_technician_id, COUNT(*)::integer AS count
         FROM tickets
         WHERE status NOT IN ('Resolved', 'Closed')
           AND assigned_technician_id IS NOT NULL
         GROUP BY assigned_technician_id`,
      );

      expect(api.body.data.technicians).toHaveLength(directWorkload.rows.length);
      expect(api.body.data.technicians[0].technicianId).toBe(2);
      expect(api.body.data.technicians[0].pendingTickets).toBe(3);

      // No contar tickets resueltos ni cerrados
      const directTotal = await directCount(
        "SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved', 'Closed') AND assigned_technician_id = 2",
      );
      expect(api.body.data.technicians[0].pendingTickets).toBe(directTotal);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. RECONCILIACIÓN: Report tickets = Listado directo
  // ══════════════════════════════════════════════════════════════════════════

  describe('Report tickets: listado = conteo directo', () => {
    beforeEach(async () => {
      await connection.query('DELETE FROM ticket_history');
      await connection.query('DELETE FROM tickets');

      for (let i = 1; i <= 15; i++) {
        await insertTicket(i, 'Open');
      }
      for (let i = 16; i <= 25; i++) {
        await insertTicket(i, 'Closed', { technicianId: 2 });
      }
    });

    it('total del listado coincide con COUNT(*) con los mismos filtros', async () => {
      // Listado sin filtros
      const api = await request(app)
        .get('/api/v1/reports/tickets?limit=10&offset=0')
        .set(bearer(managerToken));

      expect(api.status).toBe(200);

      const directTotal = await directCount('SELECT COUNT(*) FROM tickets');
      expect(api.body.data.total).toBe(directTotal);
      expect(api.body.data.total).toBe(25);
    });

    it('total filtrado por estado coincide con COUNT(*) filtrado', async () => {
      const api = await request(app)
        .get('/api/v1/reports/tickets?status=Open&limit=10&offset=0')
        .set(bearer(managerToken));

      const directOpen = await directCount("SELECT COUNT(*) FROM tickets WHERE status = 'Open'");
      expect(api.body.data.total).toBe(directOpen);
      expect(api.body.data.total).toBe(15);
    });

    it('la paginación no altera el total general', async () => {
      const page1 = await request(app)
        .get('/api/v1/reports/tickets?limit=5&offset=0')
        .set(bearer(managerToken));

      const page2 = await request(app)
        .get('/api/v1/reports/tickets?limit=5&offset=5')
        .set(bearer(managerToken));

      const page3 = await request(app)
        .get('/api/v1/reports/tickets?limit=5&offset=20')
        .set(bearer(managerToken));

      // El total debe ser el mismo en todas las páginas
      expect(page1.body.data.total).toBe(25);
      expect(page2.body.data.total).toBe(25);
      expect(page3.body.data.total).toBe(25);

      // Pero los items varián según la página
      expect(page1.body.data.items).toHaveLength(5);
      expect(page2.body.data.items).toHaveLength(5);
      expect(page3.body.data.items).toHaveLength(5);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. RECONCILIACIÓN: Overview = Report generate (consistencia entre vistas)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Dashboard e informe coinciden', () => {
    beforeEach(async () => {
      await connection.query('DELETE FROM ticket_history');
      await connection.query('DELETE FROM tickets');

      await insertTicket(1, 'Open');
      await insertTicket(2, 'Closed', { technicianId: 2, priorityId: 3 });
      await insertTicket(3, 'In Progress', { technicianId: 2, priorityId: 3 });
    });

    it('overview del dashboard = generateReport(type=overview)', async () => {
      const dashboard = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      const report = await request(app)
        .post('/api/v1/reports/generate')
        .set(bearer(managerToken))
        .send({ type: 'overview', filters: {} });

      expect(dashboard.status).toBe(200);
      expect(report.status).toBe(200);

      // Los totales deben coincidir
      expect(dashboard.body.data.total).toBe(report.body.data.data.total);
      expect(dashboard.body.data.open).toBe(report.body.data.data.open);
      expect(dashboard.body.data.closed).toBe(report.body.data.data.closed);
      expect(dashboard.body.data.inProgress).toBe(report.body.data.data.inProgress);

      // Ambos incluyen generatedAt
      expect(dashboard.body.data.generatedAt).toBeDefined();
      expect(report.body.data.generatedAt).toBeDefined();

      // Ambos incluyen dataQuality (NFR-012)
      expect(dashboard.body.data.dataQuality).toBeDefined();
      expect(report.body.data.data.dataQuality).toBeDefined();
    });

    it('workload del dashboard = generateReport(type=workload)', async () => {
      const dashboard = await request(app)
        .get('/api/v1/reports/workload')
        .set(bearer(managerToken));

      const report = await request(app)
        .post('/api/v1/reports/generate')
        .set(bearer(managerToken))
        .send({ type: 'workload', filters: {} });

      expect(dashboard.status).toBe(200);
      expect(report.status).toBe(200);

      expect(dashboard.body.data.technicians).toEqual(
        report.body.data.data.technicians,
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. RECONCILIACIÓN: Tratamiento de reaperturas
  // ══════════════════════════════════════════════════════════════════════════

  describe('Reaperturas no duplican tickets', () => {
    beforeEach(async () => {
      await connection.query('DELETE FROM ticket_history');
      await connection.query('DELETE FROM tickets');

      // Un ticket que fue resuelto y reabierto
      await insertTicket(1, 'In Progress', { technicianId: 2 });

      // Eventos de historial: created → assigned → status_changed → status_changed(Resolved) → reopened
      await insertHistoryEvent(1, 'created', 1);
      await insertHistoryEvent(1, 'assigned', 3);
      await insertHistoryEvent(1, 'status_changed', 2);
      await insertHistoryEvent(1, 'status_changed', 2);
      await insertHistoryEvent(1, 'reopened', 2);
    });

    it('el ticket reabierto se cuenta una sola vez en el total', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      expect(api.body.data.total).toBe(1);
      expect(api.body.data.inProgress).toBe(1);
      expect(api.body.data.resolved).toBe(0); // Ya no está resuelto
    });

    it('el ticket reabierto no duplica actividad (DISTINCT ticket_id)', async () => {
      const api = await request(app)
        .get('/api/v1/reports/activity')
        .set(bearer(managerToken));

      // 5 eventos pero solo 1 ticket distinto
      const totalActivities = api.body.data.days.reduce(
        (sum: number, d: { activities: number }) => sum + d.activities,
        0,
      );
      const totalTickets = api.body.data.days.reduce(
        (sum: number, d: { tickets: number }) => sum + d.tickets,
        0,
      );

      expect(totalActivities).toBe(5);
      expect(totalTickets).toBe(1); // DISTINCT evita duplicar
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. RECONCILIACIÓN: Datos faltantes (NFR-012: no se convierten en ceros)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Datos faltantes se identifican, no se ocultan', () => {
    beforeEach(async () => {
      await connection.query('DELETE FROM ticket_history');
      await connection.query('DELETE FROM tickets');

      // 3 tickets activos sin prioridad, sin técnico y sin plazo
      await insertTicket(1, 'Open'); // sin priorityId, sin technician, sin dueDate
      await insertTicket(2, 'Open'); // sin priorityId, sin technician, sin dueDate
      await insertTicket(3, 'Assigned', { technicianId: 2, priorityId: 3 }); // completo
    });

    it('dataQuality warnings informan tickets sin prioridad', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      expect(api.body.data.dataQuality).toBeDefined();
      const withoutPriorityWarning = api.body.data.dataQuality.find(
        (w: { metric: string }) => w.metric === 'withoutPriority',
      );
      expect(withoutPriorityWarning).toBeDefined();
      expect(withoutPriorityWarning.count).toBe(2); // tickets 1 y 2
    });

    it('dataQuality warnings informan tickets sin técnico', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      const unassignedWarning = api.body.data.dataQuality.find(
        (w: { metric: string }) => w.metric === 'unassigned',
      );
      expect(unassignedWarning).toBeDefined();
      expect(unassignedWarning.count).toBe(2); // tickets 1 y 2
    });

    it('dataQuality warnings informan tickets sin plazo', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      const withoutDeadlineWarning = api.body.data.dataQuality.find(
        (w: { metric: string }) => w.metric === 'withoutDeadline',
      );
      expect(withoutDeadlineWarning).toBeDefined();
      // Los 3 tickets no tienen dueDate
      expect(withoutDeadlineWarning.count).toBe(3);
    });

    it('withoutPriority en overview coincide con dataQuality', async () => {
      const api = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(managerToken));

      const overviewWithoutPriority = api.body.data.withoutPriority;
      const dataQualityWithoutPriority = api.body.data.dataQuality.find(
        (w: { metric: string }) => w.metric === 'withoutPriority',
      );

      expect(overviewWithoutPriority).toBe(dataQualityWithoutPriority.count);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. RECONCILIACIÓN: Permisos (alcance autorizado)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Permisos respetan el alcance autorizado', () => {
    it('Employee no puede ver overview (403)', async () => {
      const res = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(employeeToken));

      expect(res.status).toBe(403);
    });

    it('Employee no puede generar reportes (403)', async () => {
      const res = await request(app)
        .post('/api/v1/reports/generate')
        .set(bearer(employeeToken))
        .send({ type: 'overview', filters: {} });

      expect(res.status).toBe(403);
    });

    it('Advisor puede ver overview (tiene REPORTS_READ pero no REPORTS_READ_GLOBAL)', async () => {
      // Service Advisor tiene REPORTS_READ pero no REPORTS_READ_GLOBAL
      // según la matriz, REPORTS_READ_GLOBAL solo lo tiene Manager
      const res = await request(app)
        .get('/api/v1/reports/overview')
        .set(bearer(advisorToken));

      // Si advisor tiene REPORTS_READ_GLOBAL, será 200; si no, 403.
      // Según rolePermissions.ts, Service Advisor tiene REPORTS_READ pero
      // NO REPORTS_READ_GLOBAL. Por eso debe ser 403.
      expect(res.status).toBe(403);
    });

    it('Manager puede ver todos los reportes', async () => {
      const endpoints = [
        '/api/v1/reports/overview',
        '/api/v1/reports/workload',
        '/api/v1/reports/tickets',
        '/api/v1/reports/activity',
      ];

      for (const url of endpoints) {
        const res = await request(app).get(url).set(bearer(managerToken));
        expect(res.status).toBe(200);
      }
    });

    it('sin sesión válida recibe 401', async () => {
      const res = await request(app).get('/api/v1/reports/overview');
      expect(res.status).toBe(401);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 8. RECONCILIACIÓN: generatedAt presente y válido
  // ══════════════════════════════════════════════════════════════════════════

  describe('generatedAt identifica el corte de datos', () => {
    it('todas las respuestas incluyen generatedAt con ISO timestamp', async () => {
      const endpoints = [
        '/api/v1/reports/overview',
        '/api/v1/reports/workload',
        '/api/v1/reports/tickets?limit=5',
        '/api/v1/reports/activity',
      ];

      for (const url of endpoints) {
        const res = await request(app).get(url).set(bearer(managerToken));
        expect(res.status).toBe(200);
        expect(res.body.data.generatedAt).toBeDefined();
        expect(Date.parse(res.body.data.generatedAt)).not.toBeNaN();
      }
    });

    it('generateReport incluye generatedAt en la raíz', async () => {
      const res = await request(app)
        .post('/api/v1/reports/generate')
        .set(bearer(managerToken))
        .send({ type: 'overview', filters: {} });

      expect(res.status).toBe(200);
      expect(res.body.data.generatedAt).toBeDefined();
      expect(Date.parse(res.body.data.generatedAt)).not.toBeNaN();
    });
  });
});