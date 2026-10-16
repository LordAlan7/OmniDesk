import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  ok,
  paginated,
  paginationSchema,
  parseId,
} from '../../shared/http';
import {
  authenticate,
  currentUser,
} from '../../shared/security/guards';
import {
  PERMISSIONS,
  requirePermission,
} from '../../shared/authorization';
import { ROLES } from '../../shared/types';
import {
  createUserSchema,
  setRolesSchema,
  updateUserSchema,
} from './users.schemas';
import {
  createUser,
  getUser,
  listAvailableRoles,
  listUsers,
  setUserRoles,
  updateUser,
} from './users.service';

export const usersRouter = Router();

// Envía errores asíncronos al middleware de errores.
const handle = (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };

usersRouter.get(
  '/roles',
  authenticate,
  requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES),
  handle(async (_req, res) => {
    ok(res, await listAvailableRoles());
  }),
);

usersRouter.get(
  '/users',
  authenticate,
  requirePermission(PERMISSIONS.USERS_READ_LIST),
  handle(async (req, res) => {
    const q = paginationSchema.extend({
      search: z.string().trim().max(200).optional(),
      role: z.enum(ROLES).optional(),
      active: z.enum(['true', 'false']).optional(),
    }).parse(req.query);

    const search = q.search?.toLowerCase();
    const users = await listUsers();

    const items = users.filter((user) => {
      const matchesSearch =
        !search ||
        user.name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search);

      const matchesRole =
        !q.role ||
        user.roles.some((role) => role === q.role);

      const matchesStatus =
        q.active === undefined ||
        user.active === (q.active === 'true');

      return matchesSearch && matchesRole && matchesStatus;
    });

    paginated(res, items, q.page, q.limit);
  }),
);

usersRouter.get(
  '/users/:id',
  authenticate,
  requirePermission(PERMISSIONS.USERS_READ),
  handle(async (req, res) => {
    ok(res, await getUser(parseId(req.params.id)));
  }),
);

usersRouter.post(
  '/users',
  authenticate,
  requirePermission(PERMISSIONS.USERS_CREATE),
  requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES),
  handle(async (req, res) => {
    const body = createUserSchema.parse(req.body);

    ok(
      res,
      await createUser(body, currentUser(req).id),
      201,
    );
  }),
);

usersRouter.patch(
  '/users/:id',
  authenticate,
  (req, _res, next) => {
    req.body = updateUserSchema.parse(req.body);
    next();
  },
  (req, res, next) => {
    if (
      req.body.name !== undefined ||
      req.body.email !== undefined
    ) {
      return requirePermission(PERMISSIONS.USERS_UPDATE)(
        req, res, next,
      );
    }

    next();
  },
  (req, res, next) => {
    if (req.body.roles !== undefined) {
      return requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES)(
        req, res, next,
      );
    }

    next();
  },
  (req, res, next) => {
    if (req.body.active !== undefined) {
      return requirePermission(PERMISSIONS.USERS_DEACTIVATE)(
        req, res, next,
      );
    }

    next();
  },
  handle(async (req, res) => {
    const body = updateUserSchema.parse(req.body);

    ok(
      res,
      await updateUser(
        parseId(req.params.id),
        body,
        currentUser(req).id,
      ),
    );
  }),
);

usersRouter.put(
  '/users/:id/roles',
  authenticate,
  requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES),
  handle(async (req, res) => {
    const body = setRolesSchema.parse(req.body);

    ok(
      res,
      await setUserRoles(
        parseId(req.params.id),
        body.roles,
        currentUser(req).id,
      ),
    );
  }),
);