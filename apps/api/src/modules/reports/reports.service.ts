
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
