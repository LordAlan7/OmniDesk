import { apiPage } from '@/api/http'

export type AiSourceType = 'article' | 'document'
export type AuthorizationStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'invalidated'

export interface AiSourceAuthorization {
  id: number
  sourceType: AiSourceType
  sourceId: number
  sourceVersion: string
  contentHash: string
  title: string
  status: AuthorizationStatus
  requestedBy: number
  requestedAt: string
  reviewedBy: number | null
  reviewedAt: string | null
  reviewNote: string | null
  revokedBy: number | null
  revokedAt: string | null
  revocationReason: string | null
  invalidatedAt: string | null
  invalidationReason: string | null
  ingestionStatus: 'not_ingested' | 'ingested' | 'failed'
  ingestionError: string | null
  chunkCount: number
}

export async function listAiSources(status?: AuthorizationStatus): Promise<AiSourceAuthorization[]> {
  const query = status ? `?status=${status}` : ''
  return (await apiPage<AiSourceAuthorization[]>(`/ai/sources${query}`)).data
}

export async function requestAiSource(sourceType: AiSourceType, sourceId: number) {
  return (await apiPage<AiSourceAuthorization>('/ai/sources', { method: 'POST', body: { sourceType, sourceId } })).data
}

export async function approveAiSource(id: number, note?: string) {
  return (await apiPage<AiSourceAuthorization>(`/ai/sources/${id}/approve`, { method: 'POST', body: note ? { note } : {} })).data
}

export async function rejectAiSource(id: number, note: string) {
  return (await apiPage<AiSourceAuthorization>(`/ai/sources/${id}/reject`, { method: 'POST', body: { note } })).data
}

export async function revokeAiSource(id: number, reason: string) {
  return (await apiPage<AiSourceAuthorization>(`/ai/sources/${id}/revoke`, { method: 'POST', body: { reason } })).data
}
export async function retryAiSourceIngestion(id: number): Promise<AiSourceAuthorization> {
  return (await apiPage<AiSourceAuthorization>(
    `/ai/sources/${id}/retry-ingestion`,
    { method: 'POST' },
  )).data
}
