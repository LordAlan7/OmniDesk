import type { AuthUser } from '../../shared/types';
import type {
  AiApplicationApproval,
  AiCreationApproval,
} from '../../shared/db/ai-validation';
import type { AiSourceType, KnowledgeSourceSnapshot } from './sources/sources.types';

/**
 * Puertos del módulo AI (paso 8): lo único que la IA necesita de tickets,
 * conocimiento e inventario. app.ts (raíz de composición) los conecta;
 * el módulo NUNCA importa esos módulos. Para separarlo como servicio,
 * basta cambiar los adaptadores de app.ts por clientes HTTP.
 */

/** Vista mínima del ticket que consume la IA. */
export interface AiTicketView {
  id: number;
  title: string;
  description: string;
  status: string;
  categoryId: number;
  version: number;
  storeLocation: string | null;
  motorcycleModel: string | null;
  vehicleVin?: string | null;
}

export interface AiCreateTicketInput {
  title: string;
  description: string;
  categoryId: number;
  storeLocation: string;
  motorcycleModel?: string;
  vehicleVin?: string;
}

export interface AiResolutionInput {
  resolution: string;
  resolutionVerification: string;
  rootCause?: string;
  observations?: string;
  knowledgeArticleId?: number;
}

export interface AiInvestigationInput {
  activity: string;
  result: string;
  knowledgeArticleId?: number;
}

export interface TicketsPort {
  getTicketForUser(id: number, user: AuthUser): Promise<AiTicketView>;
  listCategories(): Promise<{ id: number; name: string }[]>;
  createTicket(
    data: AiCreateTicketInput,
    user: AuthUser,
    idempotencyKey?: string,
    aiValidation?: AiCreationApproval,
  ): Promise<AiTicketView>;
  resolveTicket(
    id: number,
    input: AiResolutionInput,
    user: AuthUser,
    expectedVersion?: number,
    aiValidation?: AiApplicationApproval,
  ): Promise<AiTicketView>;
  addInvestigation(
    id: number,
    input: AiInvestigationInput,
    user: AuthUser,
    aiValidation?: AiApplicationApproval,
  ): Promise<{ id: number }>;
}

export interface KnowledgePort {
  readSource(
    type: AiSourceType,
    id: number,
    user: AuthUser | null,
  ): Promise<KnowledgeSourceSnapshot | null>;
}

export interface AiInventoryVehicle {
  id: string;
  vin: string;
  brand: string;
  model: string;
  year: number;
  status: string;
}

export interface AiInventoryWarranty {
  status: string;
  expiresAt: string | null;
  daysRemaining: number | null;
  coverage: string | null;
  openClaims: number;
}

export interface AiInventoryProduct {
  sku: string;
  name: string;
  brand: string | null;
  category: { name: string } | null;
  stockLevel: string;
}

export interface InventoryPort {
  getVehicleByVin(vin: string): Promise<AiInventoryVehicle>;
  getVehicleWarranty(vehicleId: string): Promise<AiInventoryWarranty>;
  getCompatibleProducts(vehicleId: string): Promise<AiInventoryProduct[]>;
}

export interface AiPorts {
  tickets: TicketsPort;
  knowledge: KnowledgePort;
  inventory: InventoryPort;
}

let ports: AiPorts | undefined;

export function configureAiPorts(next: AiPorts): void {
  ports = next;
}

/** Solo pruebas. */
export function resetAiPorts(): void {
  ports = undefined;
}

export function aiPorts(): AiPorts {
  if (!ports) {
    throw new Error('AI ports not configured. Call configureAiPorts() at bootstrap (app.ts).');
  }
  return ports;
}

/* Fachada perezosa: mismos nombres que el servicio de tickets, para cambiar solo el import. */
export const getTicketForUser: TicketsPort['getTicketForUser'] = (id, user) =>
  aiPorts().tickets.getTicketForUser(id, user);

export const listCategories: TicketsPort['listCategories'] = () =>
  aiPorts().tickets.listCategories();

export const createTicket: TicketsPort['createTicket'] = (data, user, key, validation) =>
  aiPorts().tickets.createTicket(data, user, key, validation);

export const resolveTicket: TicketsPort['resolveTicket'] = (id, input, user, version, validation) =>
  aiPorts().tickets.resolveTicket(id, input, user, version, validation);

export const addInvestigation: TicketsPort['addInvestigation'] = (id, input, user, validation) =>
  aiPorts().tickets.addInvestigation(id, input, user, validation);