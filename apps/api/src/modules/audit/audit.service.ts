import { env } from '../../config/env';
import { currentCorrelationId } from '../../shared/context/requestContext';
import type { DatabaseClient } from '../../shared/db/types';
import { redactSensitive } from '../../shared/security/redact';
import { auditDefinition, type AuditAction } from './audit.catalog';
import { memoryAuditRepository } from './audit.repository';
import { postgresAuditRepository } from './audit.postgres.repository';
import type { AuditFilters, AuditInput, AuditRecord } from './audit.types';

const useMemory = env.nodeEnv === 'test';

type RecordInput = Omit<AuditInput, 'action' | 'entityId' | 'actorId' | 'metadata'> & {
  action: AuditAction;
  entityId?: number | null;
  actorId?: number | null;
  metadata?: Record<string, unknown>;
};

/** Completa el registro con los datos confiables del servidor (resultado, correlación, sin secretos). */
function build(input: RecordInput): AuditInput {
  const definition = auditDefinition(input.action);
  if (!definition) {
    throw new Error(`La acción de auditoría "${input.action}" no está en el catálogo.`);
  }

  return {
    entityId: null,
    actorId: null,
    ...input,
    outcome: definition.outcome,
    correlationId: input.correlationId ?? currentCorrelationId(),
    // NFR-002: nunca persistir credenciales/tokens en la bitácora.
    metadata: redactSensitive(input.metadata ?? {}),
  };
}

/**
 * Registro de auditoría "mejor esfuerzo" para eventos que no comparten transacción con el
 * cambio (autenticación, usuarios, conocimiento, adjuntos). Un fallo se informa en el log del
 * servidor pero no revierte la operación. Para cambios de negocio críticos usa
 * `recordAuditInTransaction`.
 */
export function recordAudit(input: RecordInput): void {
  const record = build(input);

  if (useMemory) {
    memoryAuditRepository.add(record);
    return;
  }

  void postgresAuditRepository.add(record).catch((cause: unknown) => {
    console.error('[audit] no se pudo persistir el evento', input.action, cause instanceof Error ? cause.message : cause);
  });
}

/**
 * Registro dentro de la transacción del cambio: si la auditoría falla, el cambio se revierte
 * (no existe un cambio confirmado sin su auditoría).
 */
export async function recordAuditInTransaction(client: DatabaseClient, input: RecordInput): Promise<void> {
  await postgresAuditRepository.addInTransaction(client, build(input));
}

/** Variante para el repositorio en memoria (pruebas): equivalente sin transacción. */
export function recordAuditInMemory(input: RecordInput): void {
  memoryAuditRepository.add(build(input));
}

export async function listAudit(
  filters: AuditFilters,
  page: number,
  limit: number,
): Promise<{ items: AuditRecord[]; total: number }> {
  return useMemory
    ? memoryAuditRepository.list(filters, page, limit)
    : postgresAuditRepository.list(filters, page, limit);
}

export async function getAudit(id: number): Promise<AuditRecord | undefined> {
  return useMemory ? memoryAuditRepository.findById(id) : postgresAuditRepository.findById(id);
}
