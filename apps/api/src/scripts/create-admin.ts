// Crea el PRIMER administrador en una base nueva (producción). Solo inserta si el correo no existe.
// Uso (PowerShell, desde apps\api), con las variables solo en esa ventana:
//   $env:DATABASE_URL = '<cadena de Supabase>'
//   $env:ADMIN_EMAIL = 'tu@correo.com'; $env:ADMIN_NAME = 'Tu Nombre'; $env:ADMIN_PASSWORD = '<contraseña larga>'
//   npm run create-admin
// No usa la configuración de la API (no necesita JWT_SECRET) y no imprime la contraseña.
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!url || !email || !name || !password) {
    throw new Error('Faltan variables: DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME y ADMIN_PASSWORD.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('ADMIN_EMAIL no parece un correo válido.');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.');

  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount) {
      console.log(`Ya existe ${email}. No se cambió nada.`);
      await client.query('ROLLBACK');
      return;
    }

    const role = await client.query<{ id: number }>('SELECT id FROM roles WHERE name = $1', ['Administrator']);
    const roleId = role.rows[0]?.id;
    if (!roleId) throw new Error('No existe el rol Administrator: ¿se aplicaron las migraciones?');

    const hash = await bcrypt.hash(password, 12);
    const inserted = await client.query<{ id: number }>(
      'INSERT INTO users (name, email, password_hash, active) VALUES ($1, $2, $3, true) RETURNING id',
      [name, email, hash],
    );
    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [inserted.rows[0]!.id, roleId]);

    await client.query('COMMIT');
    console.log(`Administrador creado: ${email}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo crear el administrador.');
  process.exitCode = 1;
});
