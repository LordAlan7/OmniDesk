import { can, PERMISSIONS } from '../../shared/authorization';
import { Errors } from '../../shared/errors';
import type { AuthUser } from '../../shared/types';

import {
  getOverviewMetrics,
  getWorkloadMetrics,
  getReportTickets,
  getTicketActivityMetrics,
  type ReportTicketFilters,
  type ActivityFilters,
} from './reports.repository';

// NUEVOS IMPORTS PARA FR-017:
import type { ReportType, ReportDefinition, ReportResult } from './reports.types';
import {
  reportTicketFiltersSchema,
  reportActivityFiltersSchema,
} from './reports.schemas';

/**
 * FR-016: obtener estadísticas globales.
 */
export async function getOverviewForUser(user: AuthUser) {
  if (!can(user, PERMISSIONS.REPORTS_READ_GLOBAL)) {
    throw Errors.forbidden();
  }

  const metrics = await getOverviewMetrics();

  return {
    ...metrics,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * FR-016: consultar carga por técnico.
 */
export async function getWorkloadForUser(user: AuthUser) {
  if (!can(user, PERMISSIONS.REPORTS_READ_GLOBAL)) {
    throw Errors.forbidden();
  }

  const technicians = await getWorkloadMetrics();

  return {
    technicians,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * FR-016: consultar tickets filtrados para reportes.
 * Por ahora requiere acceso global de reportes.
 */
export async function getReportTicketsForUser(
  user: AuthUser,
  filters: ReportTicketFilters,
) {
  if (!can(user, PERMISSIONS.REPORTS_READ_GLOBAL)) {
    throw Errors.forbidden();
  }

  const result = await getReportTickets(filters);

  return {
    ...result,
    limit: filters.limit,
    offset: filters.offset,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * FR-016: actividad de tickets por periodo.
 */
export async function getActivityForUser(
  user: AuthUser,
  filters: ActivityFilters,
) {
  if (!can(user, PERMISSIONS.REPORTS_READ_GLOBAL)) {
    throw Errors.forbidden();
  }

  const days = await getTicketActivityMetrics(filters);

  return {
    days,
    generatedAt: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// FR-017: Catálogo de informes disponibles
// ──────────────────────────────────────────────────────────────────────────────
export function listReportDefinitions(user: AuthUser): ReportDefinition[] {
  if (!can(user, PERMISSIONS.REPORTS_READ)) {
    throw Errors.forbidden('No tienes permiso para consultar informes.');
  }

  return [
    {
      type: 'overview',
      label: 'Resumen general',
      description: 'Métricas globales de tickets y actividad.',
      permission: 'reports:read:global',
      filters: [],
    },
    {
      type: 'tickets',
      label: 'Actividad de tickets',
      description: 'Tickets creados en un período con filtros por estado, prioridad y técnico.',
      permission: 'reports:read:global',
      filters: ['status', 'priorityId', 'technicianId', 'from', 'to', 'limit', 'offset'],
    },
    {
      type: 'workload',
      label: 'Carga de trabajo',
      description: 'Tickets pendientes por técnico.',
      permission: 'reports:read:global',
      filters: [],
    },
    {
      type: 'activity',
      label: 'Actividad por período',
      description: 'Tickets creados y resueltos por día en un rango de fechas.',
      permission: 'reports:read:global',
      filters: ['from', 'to'],
    },
  ];
}

// ──────────────────────────────────────────────────────────────────────────────
// FR-017: Generación de informe con metadatos
// ──────────────────────────────────────────────────────────────────────────────
export async function generateReport(
  user: AuthUser,
  type: ReportType,
  filters: Record<string, unknown>,
): Promise<ReportResult> {
  if (!can(user, PERMISSIONS.REPORTS_READ)) {
    throw Errors.forbidden('No tienes permiso para generar informes.');
  }

  let data: unknown;
  const limitations: string[] = [];
  const generatedAt = new Date().toISOString();

  switch (type) {
    case 'overview': {
      data = await getOverviewForUser(user);
      break;
    }
    case 'tickets': {
      const ticketFilters = reportTicketFiltersSchema.parse(filters);
      data = await getReportTicketsForUser(user, ticketFilters);
      if (!ticketFilters.from || !ticketFilters.to) {
        limitations.push('Sin rango de fechas: se muestran todos los tickets sin límite temporal.');
      }
      break;
    }
    case 'workload': {
      data = await getWorkloadForUser(user);
      limitations.push('La carga se calcula con la asignación vigente; no reconstruye historial.');
      break;
    }
    case 'activity': {
      const activityFilters = reportActivityFiltersSchema.parse(filters);
      data = await getActivityForUser(user, activityFilters);
      if (!activityFilters.from || !activityFilters.to) {
        limitations.push('Sin rango de fechas explícito: se aplica el rango por defecto del servicio.');
      }
      break;
    }
    default:
      throw Errors.validation([{ field: 'type', message: `Tipo de informe no soportado: ${type}` }]);
  }

  return {
    type,
    generatedAt,
    filters,
    data,
    limitations,
  };
}