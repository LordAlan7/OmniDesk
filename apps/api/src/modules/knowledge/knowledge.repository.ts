import { env } from '../../config/env';
import { KnowledgeArticle, KnowledgeFilter } from './knowledge.types';
import { postgresKnowledgeRepository } from './knowledge.postgres.repository';

const articles: KnowledgeArticle[] = [];
let nextId = 1;

const memoryKnowledgeRepository = {
  async create(data: any): Promise<KnowledgeArticle> {
    const article: KnowledgeArticle = {
      id: nextId++,
      ...data,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    articles.push(article);
    return article;
  },
  async findById(id: number) {
    return articles.find((a) => a.id === id);
  },
  async search(filter: KnowledgeFilter, page: number, limit: number) {
    let filtered = articles;
    if (filter.status) filtered = filtered.filter((a) => a.status === filter.status);
    if (filter.categoryId) filtered = filtered.filter((a) => a.categoryId === filter.categoryId);
    if (filter.text) {
      const regex = new RegExp(filter.text, 'i');
      filtered = filtered.filter((a) => regex.test(a.title) || regex.test(a.problemDescription) || regex.test(a.solution));
    }
    const start = (page - 1) * limit;
    return { items: filtered.slice(start, start + limit), total: filtered.length };
  },
  async save(article: KnowledgeArticle) {
    article.updatedAt = new Date().toISOString();
    article.version += 1;
    return article;
  },
};

const useMemory = env.nodeEnv === 'test';
export const knowledgeRepository = useMemory ? memoryKnowledgeRepository : postgresKnowledgeRepository;