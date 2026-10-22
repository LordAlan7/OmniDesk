import { Router } from 'express';
import { ok, paginated, parseId } from '../../shared/http';
import { authenticate, currentUser } from '../../shared/security/guards';
import { categoryUpdateSchema, createTicketSchema, listTicketsSchema, updateTicketSchema, prioritySchema, assignmentSchema, statusSchema, resolutionSchema, closeSchema } from './tickets.schemas';
import * as service from './tickets.service';
import { businessInfoUpdateSchema } from './tickets.schemas';

import { trackingQuery, listOwnTickets, ownTicket, trackingTicket, canReadInternalHistory } from './tickets.tracking';

export const ticketsRouter = Router();

ticketsRouter.get('/me/tickets', authenticate, async (req, res, next) => {
  try {
    const { page, limit, ...filters } = trackingQuery.parse(req.query);
    paginated(res, await listOwnTickets(currentUser(req), filters), page, limit);
  } catch (err) { next(err); }
});

ticketsRouter.get('/me/tickets/:id', authenticate, async (req, res, next) => {
  try { ok(res, await ownTicket(parseId(req.params.id), currentUser(req))); }
  catch (err) { next(err); }
});

// Endpoint para obtener categorías para el formulario
ticketsRouter.get('/tickets/categories', authenticate, async (_req, res, next) => {
  try {
    ok(res, await service.listCategories());
  } catch (err) {
    next(err);
  }
});

ticketsRouter.get('/ticket-priorities', authenticate, async (_req, res, next) => {
  try {
    ok(res, await service.listPriorities());
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
    const user = currentUser(req);
    const tickets = await service.listTickets(user, filters);
    const visible = await Promise.all(tickets.map(ticket =>
      canReadInternalHistory(ticket, user) ? ticket : trackingTicket(ticket)));
    paginated(res, visible, page, limit);
  } catch (err) {
    next(err);
  }
});

ticketsRouter.get('/tickets/:id', authenticate, async (req, res, next) => {
  try {
    const user = currentUser(req);
    const ticket = await service.getTicketForUser(parseId(req.params.id), user);
    ok(res, canReadInternalHistory(ticket, user) ? ticket : await trackingTicket(ticket));
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
    ok(res, await service.setPriority(
      parseId(req.params.id),
      priorityId,
      currentUser(req),
      { expectedVersion, reason },
    ));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/tickets/:id/assignment', authenticate, async (req, res, next) => {
  try {
    const { technicianId, dueDate, expectedVersion, reason } = assignmentSchema.parse(req.body);
    ok(
      res,
      await service.assignTechnician(
        parseId(req.params.id),
        technicianId,
        dueDate,
        currentUser(req),
        { expectedVersion, reason },
      ),
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

ticketsRouter.patch('/tickets/:id/business-information', authenticate, async (req, res, next) => {
  try {
    const body = businessInfoUpdateSchema.parse(req.body);
    ok(res, await service.updateBusinessInfo(parseId(req.params.id), body, currentUser(req)));
  } catch (err) {
    next(err);
  }
});
