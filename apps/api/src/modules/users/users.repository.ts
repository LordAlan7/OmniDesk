import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { Role } from '../../shared/types';
import { User } from './users.types';

/**
 * Repositorio EN MEMORIA (esqueleto). Para pasar a PostgreSQL:
 * reimplementa estos mismos métodos con getPool() (ver db/migrations/001_init.sql).
 */
const users: User[] = [];
let nextId = 1;

export const usersRepository = {
  add(data: Omit<User, 'id' | 'createdAt'>): User {
    const user: User = { ...data, id: nextId++, createdAt: new Date().toISOString() };
    users.push(user);
    return user;
  },
  findById: (id: number) => users.find((u) => u.id === id),
  findByEmail: (email: string) => users.find((u) => u.email.toLowerCase() === email.toLowerCase()),
  list: () => [...users],
};

if (env.seedDemoData) {
  const demo: [string, string, Role][] = [
    ['Demo Employee', 'employee@company.com', 'Employee'],
    ['Demo Technician', 'technician@company.com', 'Technician'],
    ['Demo Service Advisor', 'advisor@company.com', 'Service Advisor'],
    ['Demo Manager', 'manager@company.com', 'Manager'],
    ['Demo Administrator', 'admin@company.com', 'Administrator'],
  ];
  // Contraseña de DEMO solo para desarrollo/pruebas: ChangeMe123!
  const hash = bcrypt.hashSync('ChangeMe123!', 8);
  for (const [name, email, role] of demo) {
    usersRepository.add({ name, email, passwordHash: hash, roles: [role], active: true });
  }
}
