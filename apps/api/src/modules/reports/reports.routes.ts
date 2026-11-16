import { Router } from 'express';
import { ok } from '../../shared/http';
import { listReportDefinitions, generateReport } from './reports.service';
import { generateReportSchema } from './reports.schemas';
import {
  authenticate,
  currentUser,
} from '../../shared/security/guards';

import {
  getOverviewForUser,
  getWorkloadForUser,
  getReportTicketsForUser,
  getActivityForUser,
} from './reports.service';

import {
  reportTicketFiltersSchema,
  reportActivityFiltersSchema,
} from './reports.schemas';

export const reportsRouter = Router();

/**
 * FR-016: indicadores generales.
 */
reportsRouter.get(
  '/reports/overview',
  authenticate,
  async (req, res, next) => {
    try {
      const result = await getOverviewForUser(currentUser(req));
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * FR-016: tickets con filtros y paginacion.
 */
reportsRouter.get(
  '/reports/tickets',
  authenticate,
  async (req, res, next) => {
    try {
      const filters = reportTicketFiltersSchema.parse(req.query);
      const result = await getReportTicketsForUser(currentUser(req), filters);
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * FR-016: carga de trabajo por tecnico.
 */
reportsRouter.get(
  '/reports/workload',
  authenticate,
  async (req, res, next) => {
    try {
      const result = await getWorkloadForUser(currentUser(req));
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * FR-016: actividad de tickets por periodo.
 */
reportsRouter.get(
  '/reports/activity',
  authenticate,
  async (req, res, next) => {
    try {
      const filters = reportActivityFiltersSchema.parse(req.query);
      const result = await getActivityForUser(currentUser(req), filters);
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * FR-017: listar informes disponibles.
 */
reportsRouter.get(
  '/reports',
  authenticate,
  async (req, res, next) => {
    try {
      const reports = listReportDefinitions(currentUser(req));
      ok(res, reports);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * FR-017: generar un informe específico con filtros.
 */
reportsRouter.post(
  '/reports/generate',
  authenticate,
  async (req, res, next) => {
    try {
      const { type, filters } = generateReportSchema.parse(req.body);
      const result = await generateReport(currentUser(req), type, filters);
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);