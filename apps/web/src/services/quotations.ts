
import { apiPage } from '@/api/http'

export type QuotationStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'needs_more_info'

export type QuotationReviewDecision =
  | 'approved'
  | 'rejected'
  | 'needs_more_info'

export interface QuotationItem {
  id: number
  position: number
  concept: string
  description: string | null
  quantity: string
  unit: string | null
  unitPrice: null
  priceSource: 'placeholder'
  lineSubtotal: null
}

export interface QuotationVersion {
  id: number
  quotationId: number
  versionNumber: number
  aiInteractionId: number | null
  createdBy: number
  title: string | null
  description: string | null
  conditions: string | null
  observations: string | null
  currency: string | null
  subtotal: string | null
  taxTotal: string | null
  discountTotal: string | null
  total: string | null
  isComplete: boolean
  createdAt: string
  items: QuotationItem[]
}

export interface Quotation {
  id: number
  ticketId: number
  createdBy: number
  status: QuotationStatus
  createdAt: string
  updatedAt: string
  currentVersion: QuotationVersion
}

export interface QuotationReview {
  id: number
  quotationId: number
  quotationVersionId: number
  reviewerId: number
  decision: QuotationReviewDecision
  reason: string
  supersedesId: number | null
  reviewedAt: string
}

export interface QuotationItemInput {
  concept: string
  description?: string
  quantity: number
  unit?: string
}

export interface UpdateQuotationInput {
  expectedVersion: number
  title?: string | null
  description?: string | null
  conditions?: string | null
  observations?: string | null
  items?: QuotationItemInput[]
}

export interface GeneratedQuotation {
  quotation: Quotation
  missingInformation: string[]
}

export async function listQuotations(ticketId: number): Promise<Quotation[]> {
  return (
    await apiPage<Quotation[]>(`/ai/tickets/${ticketId}/quotations`)
  ).data
}

export async function generateQuotation(ticketId: number): Promise<GeneratedQuotation> {
  return (
    await apiPage<GeneratedQuotation>(
      `/ai/tickets/${ticketId}/quotations/generate`,
      { method: 'POST' },
    )
  ).data
}

export async function getQuotation(id: number): Promise<Quotation> {
  return (
    await apiPage<Quotation>(`/ai/quotations/${id}`)
  ).data
}

export async function updateQuotation(
  id: number,
  input: UpdateQuotationInput,
): Promise<Quotation> {
  return (
    await apiPage<Quotation>(`/ai/quotations/${id}`, {
      method: 'PATCH',
      body: input,
    })
  ).data
}

export async function submitQuotationForReview(id: number): Promise<Quotation> {
  return (
    await apiPage<Quotation>(`/ai/quotations/${id}/submit-review`, {
      method: 'POST',
    })
  ).data
}

export async function reviewQuotation(
  id: number,
  decision: QuotationReviewDecision,
  reason: string,
  expectedVersion: number,
): Promise<{ quotation: Quotation; review: QuotationReview }> {
  return (
    await apiPage<{ quotation: Quotation; review: QuotationReview }>(
      `/ai/quotations/${id}/review`,
      {
        method: 'POST',
        body: { decision, reason, expectedVersion },
      },
    )
  ).data
}

export async function listQuotationReviews(id: number): Promise<QuotationReview[]> {
  return (
    await apiPage<QuotationReview[]>(`/ai/quotations/${id}/reviews`)
  ).data
}
