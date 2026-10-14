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
  requireRole,
} from '../../shared/security/guards';
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

const adminOnly = [
  authenticate,
  requireRole('Administrator'),
];

// Listar usuarios con búsqueda, filtros y paginación.
usersRouter.get('/users', ...adminOnly, (req, res) => {
  const q = paginationSchema.extend({
    search: z.string().trim().max(200).optional(),
    role: z.string().optional(),
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
});

// Consultar un usuario por su ID.
usersRouter.get('/users/:id', ...adminOnly, (req, res) => {
  ok(res, getUser(parseId(req.params.id)));
});

// Crear un usuario.
usersRouter.post('/users', ...adminOnly, async (req, res) => {
  const body = createUserSchema.parse(req.body);

  ok(
    res,
    await createUser(body, currentUser(req).id),
    201,
  );
});

// Editar un usuario, incluyendo su estado activo/inactivo.
usersRouter.patch('/users/:id', ...adminOnly, (req, res) => {
  const body = updateUserSchema.parse(req.body);

  ok(
    res,
    updateUser(
      parseId(req.params.id),
      body,
      currentUser(req).id,
    ),
  );
});

// Actualizar los roles de un usuario.
usersRouter.put('/users/:id/roles', ...adminOnly, (req, res) => {
  const body = setRolesSchema.parse(req.body);

  ok(
    res,
    setUserRoles(
      parseId(req.params.id),
      body.roles,
      currentUser(req).id,
    ),
  );
});