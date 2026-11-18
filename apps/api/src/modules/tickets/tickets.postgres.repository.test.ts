
import {
  postgresTicketsRepository as repository,
} from './tickets.postgres.repository';

import { getPool } from '../../shared/db/pool';
import type { Ticket } from './tickets.types';

jest.mock('../../shared/db/pool', () => ({
  getPool: jest.fn(),
}));

const row = {
  id: 10,
  title: 'Falla de acceso',
  description: 'No se puede iniciar sesión.',
  category_id: 2,
  priority_id: null,
  status: 'Assigned',
  created_by: 3,
  assigned_technician_id: 2,
  store_location: 'Centro',
  motorcycle_model: 'FT150',
  due_date: null,
  resolution: null,
  created_at: new Date(),
  updated_at: new Date(),
  resolved_at: null,
  closed_at: null,
  version: 2,
  resolution_verification: null,
  root_cause: null,
  resolution_observations: null,
  knowledge_article_id: null,
};

const ticket: Ticket = {
  id: 10,
  title: row.title,
  description: row.description,
  categoryId: 2,
  priorityId: null,
  status: 'Assigned',
  createdBy: 3,
  assignedTechnicianId: 2,
  storeLocation: 'Centro',
  motorcycleModel: 'FT150',
  dueDate: null,
  resolution: null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  resolvedAt: null,
  closedAt: null,
  version: 1,
  resolutionVerification: null,
  rootCause: null,
  resolutionObservations: null,
  knowledgeArticleId: null,
};

let query: jest.Mock;
let release: jest.Mock;

beforeEach(() => {
  query = jest.fn().mockResolvedValue({
    rows: [],
    rowCount: 1,
  });

  release = jest.fn();

  (getPool as jest.Mock).mockReturnValue({
    connect: async () => ({
      query,
      release,
    }),
  });
});

/**
 * FR-008 + NFR-009
 * Pruebas existentes del repositorio PostgreSQL.
 */

it(
  'commits the versioned update and JSON history together, preserving business fields',
  async () => {
    query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith('UPDATE tickets')
        ? [row]
        : [],
      rowCount: 1,
    }));

    const saved = await repository.saveWithHistory(
      ticket,
      1,
      [
        {
          actorId: 3,
          action: 'assigned',
          from: null,
          to: 2,
          reason: 'Cambio de responsable',
        },
      ],
    );

    expect(saved).toMatchObject({
      storeLocation: 'Centro',
      motorcycleModel: 'FT150',
      version: 2,
    });

    const update = query.mock.calls.find(
      ([sql]) =>
        String(sql).startsWith('UPDATE tickets'),
    )!;

    expect(update[0]).toContain(
      'WHERE id = $11 AND version = $12',
    );

    expect(
      update[1].slice(10, 14),
    ).toEqual([
      10,
      1,
      'Centro',
      'FT150',
    ]);

    const event = query.mock.calls.find(
      ([sql]) =>
        String(sql).startsWith(
          'INSERT INTO ticket_history',
        ),
    )!;

    expect(event[1]).toEqual([
      10,
      3,
      'assigned',
      'null',
      '2',
      'Cambio de responsable',
      null,
    ]);

    const calls = query.mock.calls.map(
      ([sql]) => String(sql),
    );

    const auditAt = calls.findIndex(
      (sql) =>
        sql.includes('INSERT INTO audit_log'),
    );

    expect(auditAt).toBeGreaterThan(
      calls.findIndex(
        (sql) => sql.startsWith('UPDATE tickets'),
      ),
    );

    expect(auditAt).toBeLessThan(
      calls.lastIndexOf('COMMIT'),
    );

    expect(
      query.mock.calls[auditAt]![1].slice(0, 2),
    ).toEqual([
      'ticket.assigned',
      'ticket',
    ]);

    expect(query.mock.calls.at(-1)?.[0])
      .toBe('COMMIT');

    expect(release).toHaveBeenCalledTimes(1);
  },
);

it(
  'rolls back the ticket change when the audit insert fails',
  async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO audit_log')) {
        throw new Error('audit unavailable');
      }

      return {
        rows: sql.startsWith('UPDATE tickets')
          ? [row]
          : [],
        rowCount: 1,
      };
    });

    await expect(
      repository.saveWithHistory(
        ticket,
        1,
        [
          {
            actorId: 3,
            action: 'assigned',
            to: 2,
          },
        ],
      ),
    ).rejects.toThrow('audit unavailable');

    const calls = query.mock.calls.map(
      ([sql]) => String(sql),
    );

    expect(calls).not.toContain('COMMIT');
    expect(calls.at(-1)).toBe('ROLLBACK');
  },
);

it(
  'rolls back stale versions without inserting history',
  async () => {
    query.mockImplementation(async () => ({
      rows: [],
      rowCount: 0,
    }));

    await expect(
      repository.saveWithHistory(
        ticket,
        1,
        [
          {
            actorId: 3,
            action: 'assigned',
            to: 2,
          },
        ],
      ),
    ).rejects.toMatchObject({
      status: 409,
    });

    expect(
      query.mock.calls.some(
        ([sql]) =>
          String(sql).startsWith('INSERT'),
      ),
    ).toBe(false);

    expect(query.mock.calls.at(-1)?.[0])
      .toBe('ROLLBACK');

    expect(release).toHaveBeenCalledTimes(1);
  },
);

it(
  'rolls back the ticket update if history insertion fails',
  async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT')) {
        throw new Error('history unavailable');
      }

      return {
        rows: sql.startsWith('UPDATE tickets')
          ? [row]
          : [],
        rowCount: 1,
      };
    });

    await expect(
      repository.saveWithHistory(
        ticket,
        1,
        [
          {
            actorId: 3,
            action: 'assigned',
            to: 2,
          },
        ],
      ),
    ).rejects.toThrow('history unavailable');

    const calls = query.mock.calls.map(
      ([sql]) => String(sql),
    );

    expect(calls).not.toContain('COMMIT');
    expect(calls.at(-1)).toBe('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  },
);

/**
 * AIR-006 + FR-015
 * Pruebas de aplicación transaccional de IA.
 */

const aiApproval = {
  validationId: 15,
  interactionId: 8,
  proposalId: '8',
  destinationId: 10,
  appliedBy: 2,
  contentVersion: 'version-aprobada',
};

const aiHistoryEntry = {
  actorId: 2,
  action: 'status_changed',
  from: 'Assigned',
  to: 'Resolved',
};

function isAiValidationUpdate(
  sql: string,
): boolean {
  return sql.includes(
    'UPDATE ai_validation AS v',
  );
}

it(
  'AIR-006: confirma el ticket y consume la aprobación antes del COMMIT',
  async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE tickets')) {
        return {
          rows: [row],
          rowCount: 1,
        };
      }

      if (isAiValidationUpdate(sql)) {
        return {
          rows: [
            { id: aiApproval.validationId },
          ],
          rowCount: 1,
        };
      }

      return {
        rows: [],
        rowCount: 1,
      };
    });

    const saved =
      await repository.saveWithHistory(
        ticket,
        1,
        [aiHistoryEntry],
        undefined,
        aiApproval,
      );

    expect(saved).toBeDefined();

    const calls = query.mock.calls.map(
      ([sql]) => String(sql),
    );

    const ticketUpdateIndex =
      calls.findIndex(
        (sql) =>
          sql.startsWith('UPDATE tickets'),
      );

    const approvalIndex =
      calls.findIndex(
        isAiValidationUpdate,
      );

    const commitIndex =
      calls.indexOf('COMMIT');

    expect(ticketUpdateIndex)
      .toBeGreaterThanOrEqual(0);

    expect(approvalIndex)
      .toBeGreaterThan(ticketUpdateIndex);

    expect(commitIndex)
      .toBeGreaterThan(approvalIndex);

    expect(calls).not.toContain('ROLLBACK');

    const approvalCall =
      query.mock.calls[approvalIndex];

    expect(approvalCall[1]).toEqual([
      aiApproval.validationId,
      aiApproval.interactionId,
      aiApproval.destinationId,
      aiApproval.appliedBy,
      aiApproval.contentVersion,
      aiApproval.proposalId,
    ]);

    expect(release)
      .toHaveBeenCalledTimes(1);
  },
);

it(
  'AIR-006: revierte el ticket cuando la aprobación ya fue utilizada',
  async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE tickets')) {
        return {
          rows: [row],
          rowCount: 1,
        };
      }

      if (isAiValidationUpdate(sql)) {
        return {
          rows: [],
          rowCount: 0,
        };
      }

      return {
        rows: [],
        rowCount: 1,
      };
    });

    await expect(
      repository.saveWithHistory(
        ticket,
        1,
        [aiHistoryEntry],
        undefined,
        aiApproval,
      ),
    ).rejects.toMatchObject({
      status: 409,
    });

    const calls = query.mock.calls.map(
      ([sql]) => String(sql),
    );

    expect(
      calls.some(isAiValidationUpdate),
    ).toBe(true);

    expect(calls).not.toContain('COMMIT');
    expect(calls.at(-1)).toBe('ROLLBACK');

    expect(release)
      .toHaveBeenCalledTimes(1);
  },
);

it(
  'AIR-006: impide consumir dos veces la misma aprobación',
  async () => {
    let approvalAlreadyUsed = false;

    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE tickets')) {
        return {
          rows: [row],
          rowCount: 1,
        };
      }

      if (isAiValidationUpdate(sql)) {
        if (approvalAlreadyUsed) {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        approvalAlreadyUsed = true;

        return {
          rows: [
            { id: aiApproval.validationId },
          ],
          rowCount: 1,
        };
      }

      return {
        rows: [],
        rowCount: 1,
      };
    });

    // Primera aplicación: debe tener éxito.
    await expect(
      repository.saveWithHistory(
        ticket,
        1,
        [aiHistoryEntry],
        undefined,
        aiApproval,
      ),
    ).resolves.toBeDefined();

    // Segunda aplicación: debe rechazarse.
    await expect(
      repository.saveWithHistory(
        ticket,
        1,
        [aiHistoryEntry],
        undefined,
        aiApproval,
      ),
    ).rejects.toMatchObject({
      status: 409,
    });

    const calls = query.mock.calls.map(
      ([sql]) => String(sql),
    );

    expect(
      calls.filter(
        (sql) => sql === 'COMMIT',
      ),
    ).toHaveLength(1);

    expect(
      calls.filter(
        (sql) => sql === 'ROLLBACK',
      ),
    ).toHaveLength(1);

    expect(
      calls.filter(
        isAiValidationUpdate,
      ),
    ).toHaveLength(2);

    expect(release)
      .toHaveBeenCalledTimes(2);
  },
);
