import { Router } from 'express';
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
  listUsers,
  setUserRoles,
  updateUser,
} from './users.service';

export const usersRouter = Router();

// Roles disponibles para los formularios administrativos.
usersRouter.get(
  '/roles',
  authenticate,
  requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES),
  (_req, res) => {
    ok(res, [...ROLES]);
  },
);

// Listar usuarios con búsqueda, filtros y paginación.
usersRouter.get(
  '/users',
  authenticate,
  requirePermission(PERMISSIONS.USERS_READ_LIST),
  (req, res) => {
    const q = paginationSchema.extend({
      search: z.string().trim().max(200).optional(),
      role: z.enum(ROLES).optional(),
      active: z.enum(['true', 'false']).optional(),
    }).parse(req.query);

    const search = q.search?.toLowerCase();

    const items = listUsers().filter((user) => {
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
  },
);

// Consultar una cuenta.
usersRouter.get(
  '/users/:id',
  authenticate,
  requirePermission(PERMISSIONS.USERS_READ),
  (req, res) => {
    ok(res, getUser(parseId(req.params.id)));
  },
);

// Crear una cuenta y asignar sus roles iniciales.
usersRouter.post(
  '/users',
  authenticate,
  requirePermission(PERMISSIONS.USERS_CREATE),
  requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES),
  async (req, res) => {
    const body = createUserSchema.parse(req.body);

    ok(
      res,
      await createUser(body, currentUser(req).id),
      201,
    );
  },
);

// Validar los campos antes de comprobar sus permisos específicos.
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
        req,
        res,
        next,
      );
    }

    next();
  },
  (req, res, next) => {
    if (req.body.roles !== undefined) {
      return requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES)(
        req,
        res,
        next,
      );
    }

    next();
  },
  (req, res, next) => {
    if (req.body.active !== undefined) {
      return requirePermission(PERMISSIONS.USERS_DEACTIVATE)(
        req,
        res,
        next,
      );
    }

    next();
  },
  (req, res) => {
    const body = updateUserSchema.parse(req.body);

    ok(
      res,
      updateUser(
        parseId(req.params.id),
        body,
        currentUser(req).id,
      ),
    );
  },
);

// Modificar únicamente los roles.
usersRouter.put(
  '/users/:id/roles',
  authenticate,
  requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES),
  (req, res) => {
    const body = setRolesSchema.parse(req.body);

    ok(
      res,
      setUserRoles(
        parseId(req.params.id),
        body.roles,
        currentUser(req).id,
      ),
    );
  },
);