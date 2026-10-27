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
  is_recurring_problem: boolean;
  symptoms: string | null;
  verification: string | null;
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
    isRecurringProblem: row.is_recurring_problem,
    symptoms: row.symptoms,
    verification: row.verification,
  };
}

const SELECT = `SELECT * FROM knowledge_articles`;

export const postgresKnowledgeRepository = {
  async create(data: { title: string; problemDescription: string; solution: string; categoryId: number; authorId: number; isRecurringProblem?: boolean; symptoms?: string; verification?: string }): Promise<KnowledgeArticle> {
    const result = await getPool().query<ArticleRow>(
      `INSERT INTO knowledge_articles (title, problem_description, solution, category_id, author_id, status, version, is_recurring_problem, symptoms, verification)
       VALUES ($1, $2, $3, $4, $5, 'draft', 1, $6, $7, $8) RETURNING *`,
      [data.title, data.problemDescription, data.solution, data.categoryId, data.authorId, data.isRecurringProblem ?? false, data.symptoms ?? null, data.verification ?? null]
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
    // NUEVO: Filtro por problema recurrente
    if (filter.isRecurringProblem !== undefined) {
      values.push(filter.isRecurringProblem);
      conditions.push(`is_recurring_problem = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const countResult = await getPool().query<{ count: string }>(`SELECT COUNT(*) FROM knowledge_articles ${where}`, values);
    const total = parseInt(countResult.rows[0]!.count, 10);

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
       SET title = $1, problem_description = $2, solution = $3, category_id = $4, status = $5, 
           is_recurring_problem = $6, symptoms = $7, verification = $8, updated_at = NOW(), version = version + 1
       WHERE id = $9 RETURNING *`,
      [article.title, article.problemDescription, article.solution, article.categoryId, article.status, article.isRecurringProblem, article.symptoms, article.verification, article.id]
    );
    if (!result.rows[0]) throw Errors.notFound('Article');
    return toArticle(result.rows[0]);
  },
};