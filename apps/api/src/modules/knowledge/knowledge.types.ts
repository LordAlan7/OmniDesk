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
  
  // NUEVOS FR-019:
  isRecurringProblem: boolean;
  symptoms: string | null;
  verification: string | null;
}

export interface KnowledgeFilter {
  text?: string;
  categoryId?: number;
  status?: KnowledgeStatus;
  isRecurringProblem?: boolean; // Filtro nuevo
}