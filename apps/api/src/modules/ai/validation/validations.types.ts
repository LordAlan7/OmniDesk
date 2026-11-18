export type ValidationDecision = 'approved' | 'rejected' | 'needs_more_info';
export type DestinationType = 'ticket' | 'quotation' | 'other';

export interface AiValidationRow {
  id: number;
  interaction_id: number;
  proposal_id: string;
  content_version: string;
  destination_type: DestinationType;
  destination_id: number | null;
  decision: ValidationDecision;
  reason: string;
  reviewer_id: number;
  reviewed_at: string;
  supersedes_id: number | null;
  applied_at: string | null;
  applied_by: number | null;
}

export interface RecordValidationInput {
  interactionId: number;
  proposalId: string;
  contentVersion: string;
  destinationType: DestinationType;
  destinationId?: number | null;
  decision: ValidationDecision;
  reason: string;
  reviewerId: number;
}

export interface ApplyValidationInput {
  validationId: number;
  destinationId: number;
  appliedBy: number;
}