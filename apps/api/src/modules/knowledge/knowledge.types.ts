export type KnowledgeStatus = 'draft' | 'approved' | 'retired';

export interface KnowledgeArticle {
  id: number;
  title: string;
  problemDescription: string;
  solution: string;
  categoryId: number;
  authorId: number;
  status: KnowledgeStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface KnowledgeFilter {
  text?: string;
  categoryId?: number;
  status?: KnowledgeStatus;
}