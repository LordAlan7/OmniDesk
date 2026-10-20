import { getPool } from '../../shared/db/pool';
import { Errors } from '../../shared/errors';
import { KnowledgeArticle, KnowledgeFilter, KnowledgeStatus } from './knowledge.types';

interface ArticleRow {
  id: number;
  title: string;
  problem_description: string;
  solution: string;
  category_id: number;
  author_id: number;
  status: KnowledgeStatus;
  created_at: Date;
  updated_at: Date;
  version: number;
}

function toArticle(row: ArticleRow): KnowledgeArticle {
  return {
    id: row.id,
    title: row.title,
    problemDescription: row.problem_description,
    solution: row.solution,
    categoryId: row.category_id,
    authorId: row.author_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

const SELECT = `SELECT * FROM knowledge_articles`;

export const postgresKnowledgeRepository = {
  async create(data: { title: string; problemDescription: string; solution: string; categoryId: number; authorId: number }): Promise<KnowledgeArticle> {
    const result = await getPool().query<ArticleRow>(
      `INSERT INTO knowledge_articles (title, problem_description, solution, category_id, author_id, status, version)
       VALUES ($1, $2, $3, $4, $5, 'draft', 1) RETURNING *`,
      [data.title, data.problemDescription, data.solution, data.categoryId, data.authorId]
    );
    return toArticle(result.rows[0]!);
  },

  async findById(id: number): Promise<KnowledgeArticle | undefined> {
    const result = await getPool().query<ArticleRow>(`${SELECT} WHERE id = $1`, [id]);
    return result.rows[0] ? toArticle(result.rows[0]) : undefined;
  },

  async search(filter: KnowledgeFilter, page: number, limit: number): Promise<{ items: KnowledgeArticle[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter.status) {
      values.push(filter.status);
      conditions.push(`status = $${values.length}`);
    }
    if (filter.categoryId) {
      values.push(filter.categoryId);
      conditions.push(`category_id = $${values.length}`);
    }
    if (filter.text) {
      values.push(`%${filter.text}%`);
      conditions.push(`(title ILIKE $${values.length} OR problem_description ILIKE $${values.length} OR solution ILIKE $${values.length})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Conteo total
    const countResult = await getPool().query<{ count: string }>(`SELECT COUNT(*) FROM knowledge_articles ${where}`, values);
    const total = parseInt(countResult.rows[0]!.count, 10);

    // Resultados paginados
    const offset = (page - 1) * limit;
    values.push(limit, offset);
    const result = await getPool().query<ArticleRow>(
      `${SELECT} ${where} ORDER BY updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return { items: result.rows.map(toArticle), total };
  },

  async save(article: KnowledgeArticle): Promise<KnowledgeArticle> {
    const result = await getPool().query<ArticleRow>(
      `UPDATE knowledge_articles
       SET title = $1, problem_description = $2, solution = $3, category_id = $4, status = $5, updated_at = NOW(), version = version + 1
       WHERE id = $6 RETURNING *`,
      [article.title, article.problemDescription, article.solution, article.categoryId, article.status, article.id]
    );
    if (!result.rows[0]) throw Errors.notFound('Article');
    return toArticle(result.rows[0]);
  },
};