import { Router } from 'express';
import { z } from 'zod';
import { ok, paginated, paginationSchema, parseId } from '../../shared/http';
import { authenticate, currentUser, requireRole } from '../../shared/security/guards';
import { createUserSchema, setRolesSchema, updateUserSchema } from './users.schemas';
import { createUser, getUser, listUsers, setUserRoles, updateUser } from './users.service';

export const usersRouter = Router();
const adminOnly = [authenticate, requireRole('Administrator')];

usersRouter.get('/users', ...adminOnly, (req, res) => {
  const q = paginationSchema.extend({ role: z.string().optional() }).parse(req.query);
  const items = listUsers().filter((u) => !q.role || u.roles.some((r) => r === q.role));
  paginated(res, items, q.page, q.limit);
});

usersRouter.get('/users/:id', ...adminOnly, (req, res) => {
  ok(res, getUser(parseId(req.params.id)));
});

usersRouter.post('/users', ...adminOnly, async (req, res) => {
  const body = createUserSchema.parse(req.body);
  ok(res, await createUser(body, currentUser(req).id), 201);
});

usersRouter.patch('/users/:id', ...adminOnly, (req, res) => {
  const body = updateUserSchema.parse(req.body);
  ok(res, updateUser(parseId(req.params.id), body, currentUser(req).id));
});

usersRouter.put('/users/:id/roles', ...adminOnly, (req, res) => {
  const body = setRolesSchema.parse(req.body);
  ok(res, setUserRoles(parseId(req.params.id), body.roles, currentUser(req).id));
});
