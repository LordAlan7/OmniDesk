import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────
// Entrada del adaptador (§10)
// ──────────────────────────────────────────────────────────────────────────

/** §10: VIN de 17 caracteres alfanuméricos, sin I, O ni Q; mayúsculas. */
export const vinSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-HJ-NPR-Z0-9]{17}$/.test(value), {
    message: 'El VIN debe tener 17 caracteres alfanuméricos, sin I, O ni Q.',
  });

export const uuidSchema = z.uuid();

/** §10: filtros de GET /products. */
export const productFiltersSchema = z
  .object({
    search: z.string().trim().min(2).max(80).optional(),
    categoryId: z.uuid().optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

// ──────────────────────────────────────────────────────────────────────────
// Respuestas de la API de Inventario (§4/§6), en modo strip: solo pasan los
// campos del contrato. price, cost, partNumber, minStock, datos de venta y
// de cliente se descartan aunque vengan en la respuesta.
// ──────────────────────────────────────────────────────────────────────────

export const vehicleSchema = z.object({
  id: z.uuid(),
  vin: z.string(),
  brand: z.string(),
  model: z.string(),
  modelId: z.uuid().nullable(),
  year: z.number().int(),
  status: z.enum(['IN_STOCK', 'RESERVED', 'SOLD', 'RETURNED']),
  locationId: z.uuid(),
  modelStock: z.number().int(),
});

export const vehicleEventSchema = z.object({
  id: z.uuid(),
  type: z.enum(['ENTRY', 'SALE', 'RETURN', 'TRANSFER', 'WARRANTY_CLAIM']),
  occurredAt: z.iso.datetime(),
  locationId: z.uuid().nullable(),
});

export const eventListSchema = z.array(vehicleEventSchema);

export const warrantySchema = z.object({
  status: z.enum(['ACTIVE', 'EXPIRED', 'VOIDED', 'NOT_APPLICABLE']),
  startDate: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  daysRemaining: z.number().int().nullable(),
  coverage: z.string().nullable(),
  voidedReason: z.string().nullable(),
  openClaims: z.number().int(),
});

const productCodeSchema = z.object({
  value: z.string().min(1),
  format: z.string().nullable().optional(),
  kind: z.string().nullable().optional(),
});

export const productSchema = z.object({
  id: z.uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().nullable(),
  category: z.object({ id: z.uuid(), name: z.string() }),
  status: z.string(),
  codes: z.array(productCodeSchema),
});

export const listMetaSchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  total: z.number(),
  totalPages: z.number().optional(),
});

export const productListSchema = z.object({
  data: z.array(productSchema),
  meta: listMetaSchema,
});

/** Fila de compatible-products: producto + stock por ubicación (sin location). */
export const compatibleProductRowSchema = productSchema.extend({
  stock: z.array(z.object({ quantity: z.number().int() })),
});

export const compatibleListSchema = z.object({
  data: z.array(compatibleProductRowSchema),
  meta: listMetaSchema,
});

/** GET /products/:id/stock → { productId, total, locations[] }. */
export const stockResponseSchema = z.object({
  productId: z.uuid(),
  total: z.number().int(),
  locations: z.array(
    z.object({
      quantity: z.number().int(),
      location: z.object({
        id: z.uuid(),
        name: z.string(),
        code: z.string(),
        type: z.string(),
      }),
    }),
  ),
});

export const vehicleModelSchema = z.object({
  id: z.uuid(),
  brand: z.string(),
  model: z.string(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  engineCc: z.number().int().nullable(),
  status: z.string(),
});

export const vehicleModelListSchema = z.array(vehicleModelSchema);