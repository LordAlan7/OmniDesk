import { can, PERMISSIONS } from '../../../shared/authorization';
import { AppError } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';
import { aiPorts, getTicketForUser } from '../ai.ports';

/**
 * Contexto de inventario para el asistente (paso 7, contrato v1.0).
 *
 * - Permiso propio (AI_CONTEXT_INVENTORY): poder consultar a la IA no da acceso a inventario.
 * - El VIN sale del ticket obtenido por el servicio autorizado (404 si no es accesible).
 * - Lista blanca de campos: sin precios, costos, ubicaciones, existencias numéricas ni
 *   motivos de anulación de garantía (texto libre).
 * - Si inventario falla, la IA sigue con la base de conocimiento y se informa en la transparencia.
 */
const MAX_PRODUCTS = 10;

export interface InventoryContextData {
  status: 'available';
  fetchedAt: string;
  vehicle: {
    vin: string;
    brand: string;
    model: string;
    year: number;
    status: string;
  };
  warranty: {
    status: string;
    expiresAt: string | null;
    daysRemaining: number | null;
    coverage: string | null;
    openClaims: number;
  } | null;
  compatibleProducts: {
    sku: string;
    name: string;
    brand: string | null;
    category: string | null;
    stockLevel: string;
  }[];
}

export interface InventoryContextUnavailable {
  status: 'unavailable';
  fetchedAt: string;
}

export type InventoryContext = InventoryContextData | InventoryContextUnavailable;

/** Resumen que se devuelve al cliente para mostrar el origen "inventario". */
export type InventoryUsage =
  | {
      status: 'used';
      source: 'inventory';
      vin: string;
      vehicle: string;
      fetchedAt: string;
      warrantyStatus: string | null;
      compatibleProducts: number;
    }
  | { status: 'unavailable'; source: 'inventory'; fetchedAt: string };

function isInventoryError(error: unknown): boolean {
  return error instanceof AppError && String(error.code).startsWith('INVENTORY_');
}

/**
 * Devuelve undefined cuando no aplica (sin permiso o ticket sin VIN).
 * Los errores de inventario NO se propagan: se devuelven como 'unavailable'.
 */
export async function buildInventoryContext(
  ticketId: number,
  user: AuthUser,
): Promise<InventoryContext | undefined> {
  if (!can(user, PERMISSIONS.AI_CONTEXT_INVENTORY)) return undefined;

  const ticket = await getTicketForUser(ticketId, user);
  if (!ticket.vehicleVin) return undefined;

  const fetchedAt = new Date().toISOString();
  const inventory = aiPorts().inventory;

  try {
    const vehicle = await inventory.getVehicleByVin(ticket.vehicleVin);

    const [warranty, products] = await Promise.allSettled([
      inventory.getVehicleWarranty(vehicle.id),
      inventory.getCompatibleProducts(vehicle.id),
    ]);

    return {
      status: 'available',
      fetchedAt,
      vehicle: {
        vin: vehicle.vin,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        status: vehicle.status,
      },
      warranty:
        warranty.status === 'fulfilled'
          ? {
              status: warranty.value.status,
              expiresAt: warranty.value.expiresAt,
              daysRemaining: warranty.value.daysRemaining,
              coverage: warranty.value.coverage,
              openClaims: warranty.value.openClaims,
            }
          : null,
      compatibleProducts:
        products.status === 'fulfilled'
          ? products.value.slice(0, MAX_PRODUCTS).map((p) => ({
              sku: p.sku,
              name: p.name,
              brand: p.brand,
              category: p.category?.name ?? null,
              stockLevel: p.stockLevel,
            }))
          : [],
    };
  } catch (error) {
    if (isInventoryError(error)) return { status: 'unavailable', fetchedAt };
    throw error;
  }
}

/** Texto de inventario = dato del servicio externo: una sola línea, sin marcas de control. */
function clean(value: string | null | undefined, max = 200): string {
  return (value ?? '')
    .replace(/\[\/?INVENTORY[^\]]*\]/gi, '[…]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Enmarca el inventario como DATO, igual que las fuentes y el ticket. */
export function frameInventoryContext(context: InventoryContextData): string {
  const v = context.vehicle;
  const lines = [
    `[INVENTORY vin=${clean(v.vin, 17)} consultado=${context.fetchedAt}]`,
    `Motocicleta: ${clean(v.brand)} ${clean(v.model)} (${v.year}), estado en inventario: ${clean(v.status)}`,
  ];

  if (context.warranty) {
    const w = context.warranty;
    lines.push(
      `Garantía: ${clean(w.status)}` +
        (w.expiresAt ? `, vence ${clean(w.expiresAt, 40)}` : '') +
        (w.daysRemaining !== null ? `, días restantes ${w.daysRemaining}` : '') +
        `, reclamos abiertos ${w.openClaims}` +
        (w.coverage ? `, cobertura: ${clean(w.coverage)}` : ''),
    );
  } else {
    lines.push('Garantía: no disponible');
  }

  if (context.compatibleProducts.length > 0) {
    lines.push(`Refacciones compatibles (máx. ${MAX_PRODUCTS}):`);
    for (const p of context.compatibleProducts) {
      lines.push(
        `- ${clean(p.sku, 60)} — ${clean(p.name)}` +
          (p.brand ? ` (${clean(p.brand, 80)}` : ' (') +
          `${p.brand && p.category ? ', ' : ''}${p.category ? clean(p.category, 80) : ''}) — existencias: ${clean(p.stockLevel, 20)}`,
      );
    }
  } else {
    lines.push('Refacciones compatibles: ninguna registrada');
  }

  lines.push('[/INVENTORY]');
  return lines.join('\n');
}

export function summarizeInventory(context: InventoryContext): InventoryUsage {
  if (context.status === 'unavailable') {
    return { status: 'unavailable', source: 'inventory', fetchedAt: context.fetchedAt };
  }

  return {
    status: 'used',
    source: 'inventory',
    vin: context.vehicle.vin,
    vehicle: `${context.vehicle.brand} ${context.vehicle.model} ${context.vehicle.year}`,
    fetchedAt: context.fetchedAt,
    warrantyStatus: context.warranty?.status ?? null,
    compatibleProducts: context.compatibleProducts.length,
  };
}