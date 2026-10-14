import { Router } from 'express';
import { z } from 'zod';
import { ok, paginated, paginationSchema, parseId } from '../../shared/http';
import { authenticate, currentUser } from '../../shared/security/guards';
import { PERMISSIONS, requirePermission } from '../../shared/authorization';
import { createUserSchema, setRolesSchema, updateUserSchema } from './users.schemas';
import { createUser, getUser, listUsers, setUserRoles, updateUser } from './users.service';

export const usersRouter = Router();

usersRouter.get(
  '/users',
  authenticate,
  requirePermission(PERMISSIONS.USERS_READ_LIST),
  (req, res) => {
    const q = paginationSchema.extend({ role: z.string().optional() }).parse(req.query);
    const items = listUsers().filter((u) => !q.role || u.roles.some((r) => r === q.role));
    paginated(res, items, q.page, q.limit);
  },
);

usersRouter.get(
  '/users/:id',
  authenticate,
  requirePermission(PERMISSIONS.USERS_READ),
  (req, res) => {
    ok(res, getUser(parseId(req.params.id)));
  },
);

usersRouter.post(
  '/users',
  authenticate,
  requirePermission(PERMISSIONS.USERS_CREATE),
  async (req, res) => {
    const body = createUserSchema.parse(req.body);
    ok(res, await createUser(body, currentUser(req).id), 201);
  },
);

usersRouter.patch(
  '/users/:id',
  authenticate,
  requirePermission(PERMISSIONS.USERS_UPDATE),
  (req, res) => {
    const body = updateUserSchema.parse(req.body);
    ok(res, updateUser(parseId(req.params.id), body, currentUser(req).id));
  },
);

usersRouter.put(
  '/users/:id/roles',
  authenticate,
  requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES),
  (req, res) => {
    const body = setRolesSchema.parse(req.body);
    ok(res, setUserRoles(parseId(req.params.id), body.roles, currentUser(req).id));
  },
);