
import { getPool } from '../../../shared/db/pool';
import { Errors } from '../../../shared/errors';
import type {
  CreateQuotationInput,
  Quotation,
  QuotationItem,
  QuotationReview,
  QuotationVersion,
  UpdateQuotationInput,
} from './quotations.types';

interface QuotationRow {
  id: number;
  ticket_id: number;
  created_by: number;
  status: Quotation['status'];
  created_at: Date;
  updated_at: Date;
}

interface VersionRow {
  id: number;
  quotation_id: number;
  version_number: number;
  ai_interaction_id: number | null;
  created_by: number;
  title: string | null;
  description: string | null;
  conditions: string | null;
  observations: string | null;
  currency: string | null;
  subtotal: string | null;
  tax_total: string | null;
  discount_total: string | null;
  total: string | null;
  is_complete: boolean;
  created_at: Date;
}

interface ItemRow {
  id: number;
  position: number;
  concept: string;
  description: string | null;
  quantity: string;
  unit: string | null;
  unit_price: string | null;
  price_source: 'placeholder' | 'catalog' | 'manual';
  line_subtotal: string | null;
}

interface QuotationReviewRow {
  id: number;
  quotation_id: number;
  quotation_version_id: number;
  reviewer_id: number;
  decision: 'approved' | 'rejected' | 'needs_more_info';
  reason: string;
  supersedes_id: number | null;
  reviewed_at: Date;
}

function mapReview(row: QuotationReviewRow): QuotationReview {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    quotationVersionId: row.quotation_version_id,
    reviewerId: row.reviewer_id,
    decision: row.decision,
    reason: row.reason,
    supersedesId: row.supersedes_id,
    reviewedAt: row.reviewed_at.toISOString(),
  };
}

function mapItem(row: ItemRow): QuotationItem {
  return {
    id: row.id,
    position: row.position,
    concept: row.concept,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    // En esta etapa los precios no se reciben ni se calculan.
    unitPrice: null,
    priceSource: 'placeholder',
    lineSubtotal: null,
  };
}

function mapVersion(
  row: VersionRow,
  items: QuotationItem[],
): QuotationVersion {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    versionNumber: row.version_number,
    aiInteractionId: row.ai_interaction_id,
    createdBy: row.created_by,
    title: row.title,
    description: row.description,
    conditions: row.conditions,
    observations: row.observations,
    currency: row.currency,
    subtotal: row.subtotal,
    taxTotal: row.tax_total,
    discountTotal: row.discount_total,
    total: row.total,
    isComplete: row.is_complete,
    createdAt: row.created_at.toISOString(),
    items,
  };
}

async function getVersion(
  client: {
    query: <T = any>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  versionId: number,
): Promise<QuotationVersion> {
  const versionResult = await client.query<VersionRow>(
    `SELECT * FROM quotation_versions WHERE id = $1`,
    [versionId],
  );

  const version = versionResult.rows[0];

  if (!version) {
    throw Errors.notFound('Quotation version');
  }

  const itemsResult = await client.query<ItemRow>(
    `SELECT * FROM quotation_items
     WHERE quotation_version_id = $1
     ORDER BY position ASC`,
    [versionId],
  );

  return mapVersion(
    version,
    itemsResult.rows.map(mapItem),
  );
}

async function getQuotation(
  client: {
    query: <T = any>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  quotationId: number,
): Promise<Quotation> {
  const result = await client.query<QuotationRow>(
    `SELECT * FROM quotations WHERE id = $1`,
    [quotationId],
  );

  const row = result.rows[0];

  if (!row) {
    throw Errors.notFound('Quotation');
  }

  const latestVersion = await client.query<{ id: number }>(
    `SELECT id
     FROM quotation_versions
     WHERE quotation_id = $1
     ORDER BY version_number DESC
     LIMIT 1`,
    [quotationId],
  );

  if (!latestVersion.rows[0]) {
    throw Errors.notFound('Quotation version');
  }

  return {
    id: row.id,
    ticketId: row.ticket_id,
    createdBy: row.created_by,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    currentVersion: await getVersion(client, latestVersion.rows[0].id),
  };
}

async function insertItems(
  client: {
    query: <T = any>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  versionId: number,
  items: CreateQuotationInput['items'],
): Promise<void> {
  for (const [index, item] of items.entries()) {
    await client.query(
      `INSERT INTO quotation_items (
        quotation_version_id,
        position,
        concept,
        description,
        quantity,
        unit,
        unit_price,
        price_source,
        line_subtotal
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULL, 'placeholder', NULL)`,
      [
        versionId,
        index + 1,
        item.concept,
        item.description ?? null,
        item.quantity,
        item.unit ?? null,
      ],
    );
  }
}

export const quotationsRepository = {
  async create(
    input: CreateQuotationInput,
    userId: number,
    interaction?: {
      question: string;
      answer: string;
      providedContext: unknown[];
    },
  ): Promise<Quotation> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      const quotationResult = await client.query<{ id: number }>(
        `INSERT INTO quotations (ticket_id, created_by, status)
         VALUES ($1, $2, 'draft')
         RETURNING id`,
        [input.ticketId, userId],
      );

      const quotationId = quotationResult.rows[0]!.id;

      let aiInteractionId: number | null = null;

      if (interaction) {
        const interactionResult = await client.query<{ id: number }>(
          `INSERT INTO ai_interaction (
            user_id,
            ticket_id,
            question,
            answer,
            sources,
            provided_context,
            citations,
            generation_config
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
          [
            userId,
            input.ticketId,
            interaction.question,
            interaction.answer,
            JSON.stringify([]),
            JSON.stringify(interaction.providedContext),
            JSON.stringify([]),
            JSON.stringify({ task: 'quotation_suggestion' }),
          ],
        );

        aiInteractionId = interactionResult.rows[0]!.id;
      }

      const versionResult = await client.query<{ id: number }>(
        `INSERT INTO quotation_versions (
          quotation_id,
          version_number,
          ai_interaction_id,
          created_by,
          title,
          description,
          conditions,
          observations,
          is_complete
        )
        VALUES ($1, 1, $2, $3, $4, $5, $6, $7, FALSE)
        RETURNING id`,
        [
          quotationId,
          aiInteractionId,
          userId,
          input.title ?? null,
          input.description ?? null,
          input.conditions ?? null,
          input.observations ?? null,
        ],
      );

      await insertItems(client, versionResult.rows[0]!.id, input.items);

      await client.query('COMMIT');

      return await getQuotation(client, quotationId);
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  },

  async findById(id: number): Promise<Quotation> {
    const client = await getPool().connect();

    try {
      return await getQuotation(client, id);
    } finally {
      client.release();
    }
  },

  async listByTicket(ticketId: number): Promise<Quotation[]> {
    const result = await getPool().query<{ id: number }>(
      `SELECT id
       FROM quotations
       WHERE ticket_id = $1
       ORDER BY updated_at DESC, id DESC`,
      [ticketId],
    );

    return Promise.all(
      result.rows.map((row) => this.findById(row.id)),
    );
  },

  async update(
    quotationId: number,
    userId: number,
    input: UpdateQuotationInput,
  ): Promise<Quotation> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      const quotationResult = await client.query<QuotationRow>(
        `SELECT * FROM quotations
         WHERE id = $1
         FOR UPDATE`,
        [quotationId],
      );

      const quotation = quotationResult.rows[0];

      if (!quotation) {
        throw Errors.notFound('Quotation');
      }

      if (!['draft', 'needs_more_info'].includes(quotation.status)) {
        throw Errors.conflict(
          'Solo se pueden modificar cotizaciones en estado draft o que requieren información adicional.',
        );
      }

      const latestResult = await client.query<VersionRow>(
        `SELECT *
         FROM quotation_versions
         WHERE quotation_id = $1
         ORDER BY version_number DESC
         LIMIT 1
         FOR UPDATE`,
        [quotationId],
      );

      const latest = latestResult.rows[0];

      if (!latest) {
        throw Errors.notFound('Quotation version');
      }

      if (latest.version_number !== input.expectedVersion) {
        throw Errors.conflict(
          'La cotización cambió. Actualiza la información antes de guardar.',
        );
      }

      const versionResult = await client.query<{ id: number }>(
        `INSERT INTO quotation_versions (
          quotation_id,
          version_number,
          created_by,
          title,
          description,
          conditions,
          observations,
          is_complete
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
        RETURNING id`,
        [
          quotationId,
          latest.version_number + 1,
          userId,
          input.title === undefined ? latest.title : input.title,
          input.description === undefined ? latest.description : input.description,
          input.conditions === undefined ? latest.conditions : input.conditions,
          input.observations === undefined ? latest.observations : input.observations,
        ],
      );

      const newVersionId = versionResult.rows[0]!.id;

      if (input.items !== undefined) {
        await insertItems(client, newVersionId, input.items);
      } else {
        await client.query(
          `INSERT INTO quotation_items (
            quotation_version_id,
            position,
            concept,
            description,
            quantity,
            unit,
            unit_price,
            price_source,
            line_subtotal
          )
          SELECT
            $1,
            position,
            concept,
            description,
            quantity,
            unit,
            NULL,
            'placeholder',
            NULL
          FROM quotation_items
          WHERE quotation_version_id = $2
          ORDER BY position`,
          [newVersionId, latest.id],
        );
      }

      await client.query(
        `UPDATE quotations
        SET status = 'draft',
            updated_at = now()
        WHERE id = $1`,
        [quotationId],
      );

      await client.query('COMMIT');

      return await getQuotation(client, quotationId);
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  },

  async review(
    quotationId: number,
    reviewerId: number,
    input: {
      decision: 'approved' | 'rejected' | 'needs_more_info';
      reason: string;
      expectedVersion: number;
    },
  ): Promise<{ quotation: Quotation; review: QuotationReview }> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      const quotationResult = await client.query<QuotationRow>(
        `SELECT *
         FROM quotations
         WHERE id = $1
         FOR UPDATE`,
        [quotationId],
      );

      const quotation = quotationResult.rows[0];

      if (!quotation) {
        throw Errors.notFound('Quotation');
      }

      if (quotation.status !== 'pending_review') {
        throw Errors.invalidState(
          'La cotización debe estar pendiente de revisión.',
        );
      }

      const versionResult = await client.query<VersionRow>(
        `SELECT *
         FROM quotation_versions
         WHERE quotation_id = $1
         ORDER BY version_number DESC
         LIMIT 1
         FOR UPDATE`,
        [quotationId],
      );

      const version = versionResult.rows[0];

      if (!version) {
        throw Errors.notFound('Quotation version');
      }

      if (version.version_number !== input.expectedVersion) {
        throw Errors.conflict(
          'La cotización cambió. Actualiza la información antes de revisarla.',
        );
      }

      if (input.decision === 'approved' && !version.is_complete) {
        throw Errors.invalidState(
          'No se puede aprobar una cotización incompleta.',
        );
      }

      const previousResult = await client.query<{ id: number }>(
        `SELECT id
         FROM quotation_reviews
         WHERE quotation_id = $1
         ORDER BY id DESC
         LIMIT 1`,
        [quotationId],
      );

      const reviewResult = await client.query<QuotationReviewRow>(
        `INSERT INTO quotation_reviews (
          quotation_id,
          quotation_version_id,
          reviewer_id,
          decision,
          reason,
          supersedes_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          quotationId,
          version.id,
          reviewerId,
          input.decision,
          input.reason,
          previousResult.rows[0]?.id ?? null,
        ],
      );

      await client.query(
        `UPDATE quotations
         SET status = $2,
             updated_at = now()
         WHERE id = $1`,
        [quotationId, input.decision],
      );

      const review = mapReview(reviewResult.rows[0]!);

      await client.query('COMMIT');

      const updatedQuotation = await getQuotation(client, quotationId);

      return {
        quotation: updatedQuotation,
        review,
      };
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  },

  async listReviews(quotationId: number): Promise<QuotationReview[]> {
    const result = await getPool().query<QuotationReviewRow>(
      `SELECT *
       FROM quotation_reviews
       WHERE quotation_id = $1
       ORDER BY reviewed_at ASC, id ASC`,
      [quotationId],
    );

    return result.rows.map(mapReview);
  },

  async submitForReview(
    quotationId: number,
    userId: number,
  ): Promise<Quotation> {
    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      const quotationResult = await client.query<QuotationRow>(
        `SELECT *
        FROM quotations
        WHERE id = $1
        FOR UPDATE`,
        [quotationId],
      );

      const quotation = quotationResult.rows[0];

      if (!quotation) {
        throw Errors.notFound('Quotation');
      }

      if (quotation.created_by !== userId) {
        throw Errors.forbidden(
          'Solo el creador de la cotización puede enviarla a revisión.',
        );
      }

      if (quotation.status !== 'draft') {
        throw Errors.conflict(
          'Solo se pueden enviar a revisión cotizaciones en estado draft.',
        );
      }

      const latestResult = await client.query<VersionRow>(
        `SELECT *
        FROM quotation_versions
        WHERE quotation_id = $1
        ORDER BY version_number DESC
        LIMIT 1
        FOR UPDATE`,
        [quotationId],
      );

      if (!latestResult.rows[0]) {
        throw Errors.notFound('Quotation version');
      }

      await client.query(
        `UPDATE quotations
        SET status = 'pending_review',
            updated_at = now()
        WHERE id = $1`,
        [quotationId],
      );

      await client.query('COMMIT');

      return await getQuotation(client, quotationId);
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  },
};
    