import fs from 'node:fs';
import path from 'node:path';

/**
 * Reglas de la arquitectura de monolito modular (NFR-007).
 * Si este test falla, un PR rompió las fronteras entre módulos.
 */
const MODULES_DIR = path.join(__dirname, 'modules');
const SHARED_DIR = path.join(__dirname, 'shared');

/** Dependencias permitidas entre módulos (grafo acíclico). Ajustar solo con acuerdo del equipo. */
const ALLOWED: Record<string, string[]> = {
  audit: [],
  notifications: [],
  users: ['audit'],
  auth: ['users', 'audit'],
  tickets: ['users', 'audit', 'notifications'],
  files: ['tickets', 'audit', 'users'],
  knowledge: ['files', 'audit'],
  ai: ['knowledge', 'tickets', 'audit'],
  reports: ['tickets'],
};

const modules = fs
  .readdirSync(MODULES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

const importsOf = (file: string): string[] =>
  [...fs.readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('modular monolith rules', () => {
  it('every module is declared in the allowed-dependencies map', () => {
    expect(modules.sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it('every module exposes a public index.ts', () => {
    for (const m of modules) {
      expect(fs.existsSync(path.join(MODULES_DIR, m, 'index.ts'))).toBe(true);
    }
  });

  it.each(modules)('module "%s" only imports other modules through their index.ts and allowed deps', (mod) => {
    for (const file of sourceFiles(path.join(MODULES_DIR, mod))) {
      for (const spec of importsOf(file)) {
        const match = spec.match(/^\.\.\/([a-z-]+)(\/.*)?$/);
        if (!match || !modules.includes(match[1]) || match[1] === mod) continue;
        const [, target, deep] = match;
        const rel = path.relative(__dirname, file);
        expect({ file: rel, spec, deepImport: !!deep }).toEqual({ file: rel, spec, deepImport: false });
        expect({ file: rel, target, allowed: ALLOWED[mod].includes(target) }).toEqual({
          file: rel,
          target,
          allowed: true,
        });
      }
    }
  });

  it('shared/ never depends on a feature module', () => {
    for (const file of sourceFiles(SHARED_DIR)) {
      for (const spec of importsOf(file)) {
        expect(spec).not.toMatch(/modules\//);
      }
    }
  });

  it('the declared dependency graph has no cycles', () => {
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (mod: string, trail: string[]): void => {
      if (state.get(mod) === 'done') return;
      expect({ cycle: state.get(mod) === 'visiting' ? [...trail, mod] : [] }).toEqual({ cycle: [] });
      state.set(mod, 'visiting');
      for (const dep of ALLOWED[mod]) visit(dep, [...trail, mod]);
      state.set(mod, 'done');
    };
    Object.keys(ALLOWED).forEach((m) => visit(m, []));
  });

  it('HTTP routes/controllers never touch repositories or the database', () => {
    for (const file of sourceFiles(MODULES_DIR).filter((f) => f.endsWith('.routes.ts'))) {
      for (const spec of importsOf(file)) {
        const rel = path.relative(__dirname, file);
        expect({ file: rel, spec, forbidden: /repository|shared\/db|^pg$/.test(spec) }).toEqual({
          file: rel,
          spec,
          forbidden: false,
        });
      }
    }
  });

  it('only repositories, db/ and scripts import the PostgreSQL driver', () => {
    for (const file of sourceFiles(__dirname)) {
      const rel = path.relative(__dirname, file).split(path.sep).join('/');
      const allowed = /repository\.ts$/.test(rel) || rel.startsWith('shared/db/') || rel.startsWith('scripts/');
      const usesDriver = importsOf(file).some((spec) => spec === 'pg' || /shared\/db\/pool$/.test(spec));
      expect({ rel, usesDriver: usesDriver && !allowed }).toEqual({ rel, usesDriver: false });
    }
  });

  it('modules never read credentials directly: only config/env.ts reads process.env', () => {
    for (const file of sourceFiles(__dirname)) {
      const rel = path.relative(__dirname, file).split(path.sep).join('/');
      if (rel === 'config/env.ts') continue;
      expect({ rel, readsEnv: /process\.env/.test(fs.readFileSync(file, 'utf8')) }).toEqual({ rel, readsEnv: false });
    }
  });
});
