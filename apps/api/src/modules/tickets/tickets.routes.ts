import { Router } from 'express';
import { ok, paginated, parseId } from '../../shared/http';
import {
  authenticate,
  currentUser,
} from '../../shared/security/guards';
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

ticketsRouter.use(authenticate);

ticketsRouter.post('/tickets', async (req, res) => {
  const body = createTicketSchema.parse(req.body);

  const ticket = await service.createTicket(
    body,
    currentUser(req),
  );

  ok(res, ticket, 201);
});

ticketsRouter.get('/tickets', async (req, res) => {
  const { page, limit, ...filters } =
    listTicketsSchema.parse(req.query);

  const tickets = await service.listTickets(
    currentUser(req),
    filters,
  );

  paginated(res, tickets, page, limit);
});

ticketsRouter.get('/tickets/:id', async (req, res) => {
  const ticket = await service.getTicketForUser(
    parseId(req.params.id),
    currentUser(req),
  );

  ok(res, ticket);
});

ticketsRouter.patch('/tickets/:id', async (req, res) => {
  const body = updateTicketSchema.parse(req.body);

  const ticket = await service.updateTicket(
    parseId(req.params.id),
    body,
    currentUser(req),
  );

  ok(res, ticket);
});

ticketsRouter.patch('/tickets/:id/priority', async (req, res) => {
  const { priorityId } = prioritySchema.parse(req.body);

  const ticket = await service.setPriority(
    parseId(req.params.id),
    priorityId,
    currentUser(req),
  );

  ok(res, ticket);
});

ticketsRouter.patch('/tickets/:id/assignment', async (req, res) => {
  const {
    technicianId,
    dueDate,
    expectedVersion,
    reason,
  } = assignmentSchema.parse(req.body);

  const ticket = await service.assignTechnician(
    parseId(req.params.id),
    technicianId,
    dueDate,
    currentUser(req),
    { expectedVersion, reason },
  );

  ok(res, ticket);
});

ticketsRouter.patch('/tickets/:id/status', async (req, res) => {
  const { status } = statusSchema.parse(req.body);

  const ticket = await service.changeStatus(
    parseId(req.params.id),
    status,
    currentUser(req),
  );

  ok(res, ticket);
});

ticketsRouter.post('/tickets/:id/resolution', async (req, res) => {
  const { resolution } = resolutionSchema.parse(req.body);

  const ticket = await service.resolveTicket(
    parseId(req.params.id),
    resolution,
    currentUser(req),
  );

  ok(res, ticket);
});

ticketsRouter.post('/tickets/:id/close', async (req, res) => {
  const { comment } = closeSchema.parse(req.body ?? {});

  const ticket = await service.closeTicket(
    parseId(req.params.id),
    comment,
    currentUser(req),
  );

  ok(res, ticket);
});

ticketsRouter.get('/tickets/:id/history', async (req, res) => {
  const history = await service.ticketHistory(
    parseId(req.params.id),
    currentUser(req),
  );

  ok(res, history);
});

ticketsRouter.get(
  '/tickets/:id/eligible-technicians',
  async (req, res) => {
    const technicians = await service.eligibleTechnicians(
      parseId(req.params.id),
      currentUser(req),
    );

    ok(res, technicians);
  },
);