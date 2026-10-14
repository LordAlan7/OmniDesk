import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { getPool } from '../shared/db/pool';
import type { Role } from '../shared/types';
import { postgresUsersRepository } from '../modules/users/users.postgres.repository';

async function seedUsers(): Promise<void> {
  if (env.nodeEnv !== 'development') {
    throw new Error(
      'Las cuentas de demostración solo se crean en desarrollo.',
    );
  }

  const accounts: [string, string, Role][] = [
    ['Demo Employee', 'employee@company.com', 'Employee'],
    ['Demo Technician', 'technician@company.com', 'Technician'],
    ['Demo Service Advisor', 'advisor@company.com', 'Service Advisor'],
    ['Demo Manager', 'manager@company.com', 'Manager'],
    ['Demo Administrator', 'admin@company.com', 'Administrator'],
  ];

  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);

  for (const [name, email, role] of accounts) {
    const existing = await postgresUsersRepository.findByEmail(email);

    if (existing) {
      console.log(`Ya existe: ${email}. Se conserva sin cambios.`);
      continue;
    }

    await postgresUsersRepository.add({
      name,
      email,
      passwordHash,
      roles: [role],
      active: true,
    });

    console.log(`Cuenta creada: ${email}`);
  }

  console.log('Preparación de cuentas terminada.');
}

seedUsers()
  .catch((cause: unknown) => {
    console.error(
      cause instanceof Error
        ? cause.message
        : 'No se pudieron preparar las cuentas.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (env.databaseUrl) {
      await getPool().end();
    }
  });