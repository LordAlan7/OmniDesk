import { Errors } from '../../../shared/errors';
import * as repo from './validations.repository';
import type {
  AiValidationRow,
  RecordValidationInput,
  DestinationType,
  ValidationDecision,
} from './validations.types';

export async function recordValidation(input: RecordValidationInput): Promise<AiValidationRow> {
  if (!input.reason || input.reason.trim().length < 5) {
    // CAMBIA ESTO por el método de error real de tu proyecto, ej: Errors.invalid()
    throw new Error('El motivo de la revisión es obligatorio (mín. 5 caracteres).');
  }
  return repo.insertValidation(input);
}

export async function getActiveValidation(
  interactionId: number,
  contentVersion: string,
  destinationType: DestinationType
): Promise<AiValidationRow | null> {
  const row = await repo.findLatestForVersion(interactionId, contentVersion, destinationType);
  return row && row.decision === 'approved' ? row : null;
}

export async function markApplied(
  validationId: number,
  destinationId: number,
  appliedBy: number
): Promise<AiValidationRow> {
  return repo.markApplied({ validationId, destinationId, appliedBy });
}

export async function listForInteraction(interactionId: number): Promise<AiValidationRow[]> {
  return repo.listForInteraction(interactionId);
}

export function hashContent(payload: unknown): string {
  return require('crypto')
    .createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((value as any)[k])).join(',') + '}';
}

export function assertDecisionAllowed(decision: ValidationDecision, roles: string[]): void {
  if (decision === 'rejected' && !roles.includes('Manager')) {
    throw new Error('Sólo un Manager puede rechazar una recomendación de IA.');
  }
}