
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  AuthUser,
  Role,
} from '../../shared/types';

import {
  getReportTicketsForUser,
  getActivityForUser,
} from './reports.service';

import {
  getReportTickets,
  getTicketActivityMetrics,
} from './reports.repository';

// Simular las consultas sin modificar PostgreSQL.
vi.mock('./reports.repository', () => ({
  getOverviewMetrics: vi.fn(),
  getWorkloadMetrics: vi.fn(),
  getReportTickets: vi.fn(),
  getTicketActivityMetrics: vi.fn(),
}));

function createUser(role: Role): AuthUser {
  return {
    id: 1,
    name: 'Usuario de prueba',
    email: 'prueba@example.com',
    roles: [role],
  };
}

const unauthorizedRoles: Role[] = [
  'Employee',
  'Technician',
  'Administrator',
  'Service Advisor',
];

describe('FR-016 - Seguridad del listado de tickets', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('permite consultar tickets al Manager', async () => {
    vi.mocked(getReportTickets).mockResolvedValue({
      total: 1,
      items: [
        {
          id: 2,
          title: 'Prueba FR-007 persistencia',
          status: 'Assigned',
          priorityId: 3,
          technicianId: 2,
          createdAt: '2026-10-19T12:26:32-06:00',
          dueDate: null,
        },
      ],
    });

    const result = await getReportTicketsForUser(
      createUser('Manager'),
      {
        status: 'Assigned',
        limit: 20,
        offset: 0,
      },
    );

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(2);
    expect(result.generatedAt).toBeDefined();

    expect(getReportTickets).toHaveBeenCalledTimes(1);
  });

  it.each(unauthorizedRoles)(
    'rechaza listado global del rol %s',
    async (role) => {
      await expect(
        getReportTicketsForUser(
          createUser(role),
          {
            limit: 20,
            offset: 0,
          },
        ),
      ).rejects.toBeDefined();

      expect(getReportTickets).not.toHaveBeenCalled();
    },
  );
});

describe('FR-016 - Seguridad de actividad por periodo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('permite consultar actividad al Manager', async () => {
    vi.mocked(getTicketActivityMetrics).mockResolvedValue([
      {
        date: '2026-10-26',
        activities: 1,
        tickets: 1,
      },
      {
        date: '2026-10-27',
        activities: 7,
        tickets: 2,
      },
    ]);

    const result = await getActivityForUser(
      createUser('Manager'),
      {
        from: '2026-10-26',
        to: '2026-10-27',
      },
    );

    expect(result.days).toHaveLength(2);

    const totalActivities = result.days.reduce(
      (total, day) => total + day.activities,
      0,
    );

    expect(totalActivities).toBe(8);
    expect(result.generatedAt).toBeDefined();

    expect(getTicketActivityMetrics).toHaveBeenCalledTimes(1);
  });

  it.each(unauthorizedRoles)(
    'rechaza actividad global del rol %s',
    async (role) => {
      await expect(
        getActivityForUser(
          createUser(role),
          {},
        ),
      ).rejects.toBeDefined();

      expect(getTicketActivityMetrics).not.toHaveBeenCalled();
    },
  );
});
