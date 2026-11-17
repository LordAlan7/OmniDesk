
import type { PoolClient } from 'pg';
import { Errors } from '../errors';

export interface AiApplicationApproval {
  validationId: number;
  interactionId: number;
  proposalId: string;
  destinationId: number;
  appliedBy: number;
  contentVersion: string;
}

/**
 * AIR-006: consume una aprobación dentro de la
 * misma transacción utilizada por FR-009.
 *
 * No ejecuta BEGIN, COMMIT ni ROLLBACK.
 */
export async function applyAiValidationInTransaction(
  client: PoolClient,
  input: AiApplicationApproval,
): Promise<void> {
  const result = await client.query(
    `
      UPDATE ai_validation AS v
      SET
        applied_at = NOW(),
        applied_by = $4
      WHERE v.id = $1
        AND v.interaction_id = $2
        AND v.destination_type = 'ticket'
        AND v.destination_id = $3
        AND v.content_version = $5
        AND v.proposal_id = $6
        AND v.decision = 'approved'
        AND v.applied_at IS NULL
        AND v.id = (
          SELECT latest.id
          FROM ai_validation AS latest
          WHERE latest.interaction_id = $2
            AND latest.content_version = $5
            AND latest.destination_type = 'ticket'
          ORDER BY latest.id DESC
          LIMIT 1
        )
      RETURNING v.id
    `,
    [
      input.validationId,
      input.interactionId,
      input.destinationId,
      input.appliedBy,
      input.contentVersion,
      input.proposalId,
    ],
  );

  if (result.rowCount !== 1) {
    throw Errors.conflict(
      'La aprobación ya fue utilizada o dejó de estar vigente.',
    );
  }
}
