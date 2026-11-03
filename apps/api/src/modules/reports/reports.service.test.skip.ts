
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, Role } from '../../shared/types';

import {
  getOverviewForUser,
  getWorkloadForUser,
} from './reports.service';

import {
  getOverviewMetrics,
  getWorkloadMetrics,
} from './reports.repository';

vi.mock('./reports.repository', () => ({
  getOverviewMetrics: vi.fn(),
  getWorkloadMetrics: vi.fn(),
}));

function createUser(role: Role): AuthUser {
  return {
    id: 1,
    name: 'Usuario de prueba',
    email: 'prueba@example.com',
    roles: [role],
  };
}

describe('FR-016 - Seguridad del panel de soporte', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('permite consultar metricas globales al Manager', async () => {
    vi.mocked(getOverviewMetrics).mockResolvedValue({
      total: 3,
      open: 0,
      assigned: 1,
      inProgress: 1,
      resolved: 0,
      closed: 1,
      overdue: 0,
      unassigned: 0,
      withoutPriority: 1,
      byPriority: [
        { priorityId: null, total: 2 },
        { priorityId: 3, total: 1 },
      ],
    });

    const result = await getOverviewForUser(
      createUser('Manager')
    );

    expect(result.total).toBe(3);
    expect(result.assigned).toBe(1);
    expect(result.generatedAt).toBeDefined();
    expect(getOverviewMetrics).toHaveBeenCalledTimes(1);
  });

  it.each([
    'Employee',
    'Technician',
    'Administrator',
    'Service Advisor',
  ] as Role[])(
    'rechaza metricas globales del rol %s',
    async (role) => {
      await expect(
        getOverviewForUser(createUser(role))
      ).rejects.toBeDefined();

      expect(getOverviewMetrics).not.toHaveBeenCalled();
    },
  );
});

describe('FR-016 - Carga de trabajo por tecnico', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('permite consultar carga global al Manager', async () => {
    vi.mocked(getWorkloadMetrics).mockResolvedValue([
      {
        technicianId: 2,
        pendingTickets: 2,
      },
    ]);

    const result = await getWorkloadForUser(
      createUser('Manager')
    );

    expect(result.technicians).toHaveLength(1);
    expect(result.technicians[0].technicianId).toBe(2);
    expect(result.technicians[0].pendingTickets).toBe(2);
    expect(result.generatedAt).toBeDefined();

    expect(getWorkloadMetrics).toHaveBeenCalledTimes(1);
  });

  it.each([
    'Employee',
    'Technician',
    'Administrator',
    'Service Advisor',
  ] as Role[])(
    'rechaza carga global del rol %s',
    async (role) => {
      await expect(
        getWorkloadForUser(createUser(role))
      ).rejects.toBeDefined();

      expect(getWorkloadMetrics).not.toHaveBeenCalled();
    },
  );
});
