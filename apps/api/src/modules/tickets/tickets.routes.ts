import { Router } from 'express';
import { ok, paginated, parseId } from '../../shared/http';
import { authenticate, currentUser } from '../../shared/security/guards';
import {
  assignmentSchema,
  closeSchema,
  createTicketSchema,
  listTicketsSchema,
  prioritySchema,
  resolutionSchema,
  statusSchema,
  updateTicketSchema,
} from './tickets.schemas';
import * as service from './tickets.service';

export const ticketsRouter = Router();

ticketsRouter.post('/tickets', authenticate, (req, res) => {
  const body = createTicketSchema.parse(req.body);
  ok(res, service.createTicket(body, currentUser(req)), 201);
});

ticketsRouter.get('/tickets', authenticate, (req, res) => {
  const { page, limit, ...filters } = listTicketsSchema.parse(req.query);
  paginated(res, service.listTickets(currentUser(req), filters), page, limit);
});

ticketsRouter.get('/tickets/:id', authenticate, (req, res) => {
  ok(res, service.getTicketForUser(parseId(req.params.id), currentUser(req)));
});

ticketsRouter.patch('/tickets/:id', authenticate, (req, res) => {
  const body = updateTicketSchema.parse(req.body);
  ok(res, service.updateTicket(parseId(req.params.id), body, currentUser(req)));
});

ticketsRouter.patch('/tickets/:id/priority', authenticate, (req, res) => {
  const { priorityId } = prioritySchema.parse(req.body);
  ok(res, service.setPriority(parseId(req.params.id), priorityId, currentUser(req)));
});

ticketsRouter.patch(
  '/tickets/:id/assignment',
  authenticate,
  async (req, res, next) => {
    try {
      const { technicianId, dueDate } =
        assignmentSchema.parse(req.body);

      const ticket = await service.assignTechnician(
        parseId(req.params.id),
        technicianId,
        dueDate,
        currentUser(req),
      );

      ok(res, ticket);
    } catch (cause) {
      next(cause);
    }
  },
);

ticketsRouter.patch('/tickets/:id/status', authenticate, (req, res) => {
  const { status } = statusSchema.parse(req.body);
  ok(res, service.changeStatus(parseId(req.params.id), status, currentUser(req)));
});

ticketsRouter.post('/tickets/:id/resolution', authenticate, (req, res) => {
  const { resolution } = resolutionSchema.parse(req.body);
  ok(res, service.resolveTicket(parseId(req.params.id), resolution, currentUser(req)));
});

ticketsRouter.post('/tickets/:id/close', authenticate, (req, res) => {
  const { comment } = closeSchema.parse(req.body ?? {});
  ok(res, service.closeTicket(parseId(req.params.id), comment, currentUser(req)));
});

ticketsRouter.get('/tickets/:id/history', authenticate, (req, res) => {
  ok(res, service.ticketHistory(parseId(req.params.id), currentUser(req)));
});
