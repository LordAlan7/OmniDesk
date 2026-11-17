
import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../../../shared/errors';
import { ok, parseId } from '../../../shared/http';
import { authenticate, currentUser } from '../../../shared/security/guards';
import { PERMISSIONS, requirePermission } from '../../../shared/authorization';
import { recordAudit } from '../../audit';
import {
  createQuotation,
  generateQuotationForTicket,
  getQuotation,
  listQuotations,
  reviewQuotation,
  submitQuotationForReview,
  updateQuotation,
} from './quotations.service';
import {
  createQuotationSchema,
  quotationReviewSchema,
  updateQuotationSchema,
} from './quotations.schemas';

export const quotationsRouter = Router();

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation(
      parsed.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.') || 'body',
        message: issue.message,
      })),
    );
  }

  return parsed.data;
}

quotationsRouter.post(
  '/ai/tickets/:ticketId/quotations/generate',
  authenticate,
  requirePermission(PERMISSIONS.AI_QUERY),
  async (req, res, next) => {
    try {
      const ticketId = parseId(req.params.ticketId, 'ticketId');
      const user = currentUser(req);

      const result = await generateQuotationForTicket(ticketId, user);

      recordAudit({
        action: 'ai.suggestion_generated',
        entity: 'quotation',
        entityId: result.quotation.id,
        actorId: user.id,
        metadata: {
          ticketId,
          aiInteractionId: result.quotation.currentVersion.aiInteractionId,
          missingInformationCount: result.missingInformation.length,
        },
      });

      ok(res, result, 201);
    } catch (cause) {
      next(cause);
    }
  },
);

quotationsRouter.get(
  '/ai/tickets/:ticketId/quotations',
  authenticate,
  async (req, res, next) => {
    try {
      const ticketId = parseId(req.params.ticketId, 'ticketId');
      ok(res, await listQuotations(ticketId, currentUser(req)));
    } catch (cause) {
      next(cause);
    }
  },
);

quotationsRouter.post(
  '/ai/quotations',
  authenticate,
  async (req, res, next) => {
    try {
      const input = parseBody(createQuotationSchema, req.body);
      ok(res, await createQuotation(input, currentUser(req)), 201);
    } catch (cause) {
      next(cause);
    }
  },
);

quotationsRouter.get(
  '/ai/quotations/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      ok(res, await getQuotation(id, currentUser(req)));
    } catch (cause) {
      next(cause);
    }
  },
);

quotationsRouter.patch(
  '/ai/quotations/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const input = parseBody(updateQuotationSchema, req.body);

      ok(res, await updateQuotation(id, input, currentUser(req)));
    } catch (cause) {
      next(cause);
    }
  },
);

quotationsRouter.post(
  '/ai/quotations/:id/submit-review',
  authenticate,
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const quotation = await submitQuotationForReview(
        id,
        currentUser(req),
      );

      ok(res, quotation);
    } catch (cause) {
      next(cause);
    }
  },
);

quotationsRouter.post(
  '/ai/quotations/:id/review',
  authenticate,
  requirePermission(PERMISSIONS.AI_VALIDATE),
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const input = parseBody(quotationReviewSchema, req.body);
      const user = currentUser(req);

      const result = await reviewQuotation(id, input, user);

      recordAudit({
        action: 'quotation.reviewed',
        entity: 'quotation',
        entityId: id,
        actorId: user.id,
        metadata: {
          decision: input.decision,
          version: input.expectedVersion,
        },
      });

      ok(res, result);
    } catch (cause) {
      next(cause);
    }
  },
);
