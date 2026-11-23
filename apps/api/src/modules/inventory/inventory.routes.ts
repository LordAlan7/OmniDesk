
import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../../shared/errors';
import { ok, paginationSchema } from '../../shared/http';
import { can } from '../../shared/authorization/policy';
import { PERMISSIONS } from '../../shared/authorization/permissions';
import { authenticate, currentUser } from '../../shared/security/guards';
import { InventoryService } from './inventory.service';

export const inventoryRouter = Router();

const inventoryService = new InventoryService();

const searchSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().max(50).optional(),
}).strict();

const vinSchema = z.string().trim().min(1).max(50);
const codeSchema = z.string().trim().min(1).max(100);
const idSchema = z.string().uuid();

inventoryRouter.use(authenticate);

inventoryRouter.use((req, _res, next) => {
  try {
    if (!can(currentUser(req), PERMISSIONS.INVENTORY_READ)) {
      throw Errors.forbidden();
    }

    next();
  } catch (cause) {
    next(cause);
  }
});

inventoryRouter.get('/vehicles', async (req, res, next) => {
  try {
    const query = searchSchema.parse(req.query);
    const result = await inventoryService.searchVehicles(query);
    ok(res, result);
  } catch (cause) {
    next(cause);
  }
});

inventoryRouter.get('/vehicles/by-vin/:vin', async (req, res, next) => {
  try {
    const vin = vinSchema.parse(req.params.vin);
    const vehicle = await inventoryService.getVehicleByVin(vin);

    if (!vehicle) {
      throw Errors.notFound('Vehicle');
    }

    ok(res, vehicle);
  } catch (cause) {
    next(cause);
  }
});

inventoryRouter.get('/vehicles/:id/compatible-products', async (req, res, next) => {
  try {
    const vehicleId = idSchema.parse(req.params.id);
    const products = await inventoryService.getCompatibleProducts(vehicleId);
    ok(res, products);
  } catch (cause) {
    next(cause);
  }
});

inventoryRouter.get('/vehicles/:id/warranty', async (req, res, next) => {
  try {
    const vehicleId = idSchema.parse(req.params.id);
    const warranty = await inventoryService.getWarrantyByVehicleId(vehicleId);

    if (!warranty) {
      throw Errors.notFound('Warranty');
    }

    ok(res, warranty);
  } catch (cause) {
    next(cause);
  }
});

inventoryRouter.get('/products', async (req, res, next) => {
  try {
    const query = searchSchema.parse(req.query);
    const result = await inventoryService.searchProducts(query);
    ok(res, result);
  } catch (cause) {
    next(cause);
  }
});

inventoryRouter.get('/products/by-code/:code', async (req, res, next) => {
  try {
    const code = codeSchema.parse(req.params.code);
    const product = await inventoryService.getProductByCode(code);

    if (!product) {
      throw Errors.notFound('Product');
    }

    ok(res, product);
  } catch (cause) {
    next(cause);
  }
});
