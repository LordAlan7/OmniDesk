import { apiRequest, ApiError, getToken, clearToken } from './api'
export interface DocumentMetadata {
  title: string; description: string; categoryId: number; source: string;
  sourceReference: string | null; edition: string | null; documentDate: string | null;
}
export interface KnowledgeDocument extends DocumentMetadata {
  id: number; categoryName: string; uploadedBy: string; createdBy: number;
  createdAt: string; updatedAt: string; status: 'draft' | 'published' | 'retired';
  revision: number; versionId: string; originalName: string; sizeBytes: number;
  sha256: string; accessRoles: string[]; aiAuthorized: false;
}
export interface Category { id: number; name: string }
export const getCategories = () => apiRequest<Category[]>('/knowledge/categories')
export const listDocuments = (query: URLSearchParams) => apiRequest<KnowledgeDocument[]>(`/knowledge/documents?${query}`)
export const getDocument = (id: number) => apiRequest<KnowledgeDocument>(`/knowledge/documents/${id}`)
export function uploadDocument(metadata: DocumentMetadata, file: File) {
  const body = new FormData()
  for (const [key,value] of Object.entries(metadata)) {
    if (value !== null) body.append(key,String(value))
  }
  body.append('file',file)
  return apiRequest<KnowledgeDocument>('/knowledge/documents',{method:'POST',body})
}
export const editDocument = (doc: KnowledgeDocument, metadata: DocumentMetadata) =>
  apiRequest<KnowledgeDocument>(`/knowledge/documents/${doc.id}`,{method:'PATCH',body:JSON.stringify({...metadata,revision:doc.revision})})
export const publishDocument = (doc: KnowledgeDocument, status: KnowledgeDocument['status'], accessRoles: string[]) =>
  apiRequest<KnowledgeDocument>(`/knowledge/documents/${doc.id}/publication`,{
    method:'PATCH',body:JSON.stringify({status,accessRoles,revision:doc.revision}),
  })
export async function downloadDocument(doc: KnowledgeDocument) {
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1').replace(/\/$/,'')
  let response: Response
  try {
    response = await fetch(`${base}/knowledge/documents/${doc.id}/content`,{
      headers:{Authorization:`Bearer ${getToken() ?? ''}`},cache:'no-store',
    })
  } catch { throw new ApiError('No se pudo conectar con el servidor.',0) }
  if (!response.ok) {
    if (response.status === 401) clearToken()
    const error = await response.json().catch(() => ({}))
    throw new ApiError(error.error?.message || 'No se pudo descargar el documento.',response.status)
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href=url; link.download=doc.originalName
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url),30000)
}
