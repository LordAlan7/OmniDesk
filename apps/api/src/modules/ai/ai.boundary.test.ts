import fs from 'node:fs';
import path from 'node:path';

/**
 * Frontera del módulo AI (paso 8): servicio de IA como componente separable.
 *
 * Ningún archivo de `modules/ai` —ni de producción, ni de pruebas, ni imports
 * de tipo— puede referir `tickets`, `knowledge` o `inventory`, por ningún
 * medio (import estático, import de tipo, require, import() o jest.mock).
 * Todo acceso va por los puertos de ai.ports.ts, inyectados en app.ts.
 * Si este test falla, alguien cruzó la frontera y el módulo dejó de ser
 * extraíble como servicio independiente.
 *
 * `../audit`, `../../shared/...` y `../../config/...` siguen permitidos.
 */

const MODULES_DIR = path.resolve(__dirname, '..');

/** Módulos vetados para `ai` desde el paso 8. */
const FORBIDDEN = ['tickets', 'knowledge', 'inventory'];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(entry.name) ? [full] : [];
  });
}

/** Especificadores usados por el archivo: import/export from, require, import() y jest.mock. */
const SPECIFIER =
  /(?:from\s+|require\(\s*|import\(\s*|jest\.mock\(\s*|jest\.requireActual\(\s*)['"]([^'"]+)['"]/g;

/** Devuelve el módulo vetado al que apunta el especificador, o null si no cruzan la frontera. */
function forbiddenModule(specifier: string, file: string): string | null {
  if (!specifier.startsWith('.')) return null; // solo los relativos cruzan módulos
  const target = path.resolve(path.dirname(file), specifier);
  return (
    FORBIDDEN.find(
      (m) =>
        target === path.join(MODULES_DIR, m) ||
        target.startsWith(path.join(MODULES_DIR, m) + path.sep),
    ) ?? null
  );
}

describe('Paso 8 - frontera del módulo AI', () => {
  it('ningún archivo de modules/ai refiere tickets, knowledge ni inventory', () => {
    const violations: string[] = [];

    for (const file of sourceFiles(__dirname)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const match of content.matchAll(SPECIFIER)) {
        const spec = match[1]!;
        const forbidden = forbiddenModule(spec, file);
        if (forbidden) {
          violations.push(
            `${path.relative(__dirname, file)}: ${spec} (módulo ${forbidden})`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('la frontera sigue viva: puertos y fachada expuestos en ai.ports.ts', () => {
    const ports = require('./ai.ports') as Record<string, unknown>;
    expect(typeof ports.configureAiPorts).toBe('function');
    expect(typeof ports.resetAiPorts).toBe('function');
    expect(typeof ports.aiPorts).toBe('function');
    for (const name of [
      'getTicketForUser',
      'listCategories',
      'createTicket',
      'resolveTicket',
      'addInvestigation',
    ]) {
      expect({ name, type: typeof ports[name] }).toEqual({ name, type: 'function' });
    }
  });
});