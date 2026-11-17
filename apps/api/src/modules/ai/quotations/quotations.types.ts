
export type QuotationStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'needs_more_info';

export interface QuotationItem {
  id: number;
  position: number;
  concept: string;
  description: string | null;
  quantity: string;
  unit: string | null;
  unitPrice: null;
  priceSource: 'placeholder';
  lineSubtotal: null;
}

export interface QuotationVersion {
  id: number;
  quotationId: number;
  versionNumber: number;
  aiInteractionId: number | null;
  createdBy: number;
  title: string | null;
  description: string | null;
  conditions: string | null;
  observations: string | null;
  currency: string | null;
  subtotal: string | null;
  taxTotal: string | null;
  discountTotal: string | null;
  total: string | null;
  isComplete: boolean;
  createdAt: string;
  items: QuotationItem[];
}

export interface Quotation {
  id: number;
  ticketId: number;
  createdBy: number;
  status: QuotationStatus;
  createdAt: string;
  updatedAt: string;
  currentVersion: QuotationVersion;
}

export interface CreateQuotationInput {
  ticketId: number;
  title?: string;
  description?: string;
  conditions?: string;
  observations?: string;
  items: {
    concept: string;
    description?: string;
    quantity: number;
    unit?: string;
  }[];
}

export interface UpdateQuotationInput {
  expectedVersion: number;
  title?: string | null;
  description?: string | null;
  conditions?: string | null;
  observations?: string | null;
  items?: {
    concept: string;
    description?: string;
    quantity: number;
    unit?: string;
  }[];
}

export type QuotationReviewDecision =
  | 'approved'
  | 'rejected'
  | 'needs_more_info';

export interface QuotationReview {
  id: number;
  quotationId: number;
  quotationVersionId: number;
  reviewerId: number;
  decision: QuotationReviewDecision;
  reason: string;
  supersedesId: number | null;
  reviewedAt: string;
}