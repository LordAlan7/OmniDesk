import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '../../shared/authorization';
import { Errors } from '../../shared/errors';
import { ok } from '../../shared/http';
import { authenticate } from '../../shared/security/guards';
import { getInventoryProvider } from './index';

/**
 * Rutas de solo lectura del inventario (contrato v1.0, §3).
 * Autenticación por sesión + permiso INVENTORY_READ. La credencial de
 * dispositivo nunca sale del backend: la usa el proveedor, no estas rutas.
 */
export const inventoryRouter = Router();

/** Instancia única: conserva circuit breaker y caché entre peticiones (§9). */
const inventory = getInventoryProvider();

/** §10: filtros de query de GET /inventory/products (strings → coerce). */
const productQuerySchema = z.object({
  search: z.string().trim().min(2).max(80).optional(),
  categoryId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * Express 5 tipa los path params como string | string[] (params repetibles);
 * en estas rutas siempre es un string simple. Se estrecha y valida aquí.
 */
function pathParam(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw Errors.validation([{ field, message: `El parámetro "${field}" es inválido.` }]);
  }
  return value;
}

inventoryRouter.get(
  '/inventory/vehicles/by-vin/:vin',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      ok(res, await inventory.getVehicleByVin(pathParam(req.params.vin, 'vin')));
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/vehicles/:id',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      ok(res, await inventory.getVehicleById(pathParam(req.params.id, 'id')));
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/vehicles/:id/events',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      ok(res, await inventory.getVehicleEvents(pathParam(req.params.id, 'id')));
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/vehicles/:id/warranty',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      ok(res, await inventory.getVehicleWarranty(pathParam(req.params.id, 'id')));
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/vehicles/:id/compatible-products',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      ok(res, await inventory.getCompatibleProducts(pathParam(req.params.id, 'id')));
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/products',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      const check = productQuerySchema.safeParse(req.query);
      if (!check.success) {
        throw Errors.validation(
          check.error.issues.map((issue) => ({
            field: issue.path.join('.') || 'query',
            message: issue.message,
          })),
        );
      }
      const result = await inventory.listProducts(check.data);
      res.json({ data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/products/by-code/:value',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      ok(res, await inventory.getProductByCode(pathParam(req.params.value, 'value')));
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/products/:id',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      ok(res, await inventory.getProductById(pathParam(req.params.id, 'id')));
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/products/:id/stock',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      ok(res, await inventory.getProductStock(pathParam(req.params.id, 'id')));
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/vehicle-models',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (_req, res, next) => {
    try {
      ok(res, await inventory.listVehicleModels());
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get(
  '/inventory/vehicle-models/:id',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  async (req, res, next) => {
    try {
      ok(res, await inventory.getVehicleModelById(pathParam(req.params.id, 'id')));
    } catch (error) {
      next(error);
    }
  },
);