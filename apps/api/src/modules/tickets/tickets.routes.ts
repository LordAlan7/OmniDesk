import { Router } from 'express';
import { ok, paginated, parseId } from '../../shared/http';
import { authenticate, currentUser } from '../../shared/security/guards';
import {
  createTicketSchema,
  listTicketsSchema,
  updateTicketSchema,
  prioritySchema,
  assignmentSchema,
  statusSchema,
  resolutionSchema,
  closeSchema,
  categoryUpdateSchema,
  linkRecurringProblemSchema,
  deadlineSchema,
  progressSchema,
} from './tickets.schemas';
import * as service from './tickets.service';

export const ticketsRouter = Router();

ticketsRouter.get('/tickets/categories', authenticate, async (_req, res, next) => {
  try {
    ok(res, await service.listCategories());
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/tickets', authenticate, async (req, res, next) => {
  try {
    const body = createTicketSchema.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    ok(res, await service.createTicket(body, currentUser(req), idempotencyKey), 201);
  } catch (err) {
    next(err);
  }
});

ticketsRouter.get('/tickets', authenticate, async (req, res, next) => {
  try {
    const { page, limit, ...filters } = listTicketsSchema.parse(req.query);
    paginated(res, await service.listTickets(currentUser(req), filters), page, limit);
  } catch (err) {
    next(err);
  }
});

ticketsRouter.get('/tickets/:id', authenticate, async (req, res, next) => {
  try {
    ok(res, await service.getTicketForUser(parseId(req.params.id), currentUser(req)));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/tickets/:id', authenticate, async (req, res, next) => {
  try {
    const body = updateTicketSchema.parse(req.body);
    ok(res, await service.updateTicket(parseId(req.params.id), body, currentUser(req)));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/tickets/:id/priority', authenticate, async (req, res, next) => {
  try {
    const { priorityId, expectedVersion, reason } = prioritySchema.parse(req.body);
    ok(
      res,
      await service.setPriority(parseId(req.params.id), priorityId, currentUser(req), { expectedVersion, reason })
    );
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/tickets/:id/assignment', authenticate, async (req, res, next) => {
  try {
    const { technicianId, dueDate, expectedVersion, reason } = assignmentSchema.parse(req.body);
    ok(
      res,
      await service.assignTechnician(parseId(req.params.id), technicianId, dueDate, currentUser(req), { expectedVersion, reason })
    );
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/tickets/:id/status', authenticate, async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    ok(res, await service.changeStatus(parseId(req.params.id), status, currentUser(req)));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/tickets/:id/resolution', authenticate, async (req, res, next) => {
  try {
    const { resolution } = resolutionSchema.parse(req.body);
    ok(res, await service.resolveTicket(parseId(req.params.id), resolution, currentUser(req)));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/tickets/:id/close', authenticate, async (req, res, next) => {
  try {
    const { comment } = closeSchema.parse(req.body ?? {});
    ok(res, await service.closeTicket(parseId(req.params.id), comment, currentUser(req)));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.get('/tickets/:id/history', authenticate, async (req, res, next) => {
  try {
    ok(res, await service.ticketHistory(parseId(req.params.id), currentUser(req)));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.get('/tickets/:id/eligible-technicians', authenticate, async (req, res, next) => {
  try {
    ok(res, await service.eligibleTechnicians(parseId(req.params.id), currentUser(req)));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/tickets/:id/category', authenticate, async (req, res, next) => {
  try {
    const { categoryId } = categoryUpdateSchema.parse(req.body);
    ok(res, await service.updateCategory(parseId(req.params.id), categoryId, currentUser(req)));
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// FR-008: Rutas de seguimiento (Alexis)
// ──────────────────────────────────────────────────────────────────────────────
ticketsRouter.get('/tickets/:id/transitions', authenticate, async (req, res, next) => {
  try {
    ok(res, await service.ticketAvailableTransitions(parseId(req.params.id), currentUser(req)));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/tickets/:id/deadline', authenticate, async (req, res, next) => {
  try {
    const body = deadlineSchema.parse(req.body);
    ok(res, await service.setDeadline(parseId(req.params.id), body.dueDate, currentUser(req), { expectedVersion: body.expectedVersion, reason: body.reason }));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/tickets/:id/progress', authenticate, async (req, res, next) => {
  try {
    const body = progressSchema.parse(req.body);
    ok(res, await service.addProgressUpdate(parseId(req.params.id), body.note, currentUser(req)));
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// FR-019: Problemas recurrentes (Edgar)
// ──────────────────────────────────────────────────────────────────────────────
ticketsRouter.get('/tickets/:id/recurring-problems', authenticate, async (req, res, next) => {
  try {
    ok(res, await service.getRecurringProblems(parseId(req.params.id), currentUser(req)));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/tickets/:id/recurring-problems', authenticate, async (req, res, next) => {
  try {
    const { articleId } = linkRecurringProblemSchema.parse(req.body);
    ok(
      res,
      await service.linkRecurringProblem(parseId(req.params.id), articleId, currentUser(req)),
      201,
    );
  } catch (err) {
    next(err);
  }
});

ticketsRouter.delete('/tickets/:id/recurring-problems/:articleId', authenticate, async (req, res, next) => {
  try {
    ok(
      res,
      await service.unlinkRecurringProblem(
        parseId(req.params.id),
        parseId(req.params.articleId, 'articleId'),
        currentUser(req),
      ),
    );
  } catch (err) {
    next(err);
  }
});