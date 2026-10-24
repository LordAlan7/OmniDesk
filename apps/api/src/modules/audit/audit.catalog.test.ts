import fs from 'node:fs';
import path from 'node:path';
import { AUDIT_EVENTS, AUDIT_ACTIONS, HISTORY_ONLY_ACTIONS, auditActionForHistory } from './audit.catalog';

const SRC = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
  });
}

const files = sourceFiles(SRC).filter((file) => !file.includes(`${path.sep}audit.catalog.ts`));
const read = (file: string) => fs.readFileSync(file, 'utf8');
const matches = (pattern: RegExp) =>
  files.flatMap((file) => [...read(file).matchAll(pattern)].map((m) => ({ file: path.relative(SRC, file), value: m[1]! })));

describe('NFR-009 event catalog coverage', () => {
  it('every action passed to recordAudit exists in the catalog', () => {
    const used = matches(/recordAudit(?:InMemory|InTransaction)?\(\s*(?:client,\s*)?\{\s*action:\s*'([^']+)'/g);
    expect(used.length).toBeGreaterThan(0);
    for (const { file, value } of used) {
      expect({ file, value, inCatalog: value in AUDIT_EVENTS }).toEqual({ file, value, inCatalog: true });
    }
  });

  it('every document audit action exists in the catalog', () => {
    const used = matches(/recordDocumentAudit\(client,\s*'([^']+)'/g);
    expect(used.length).toBeGreaterThan(0);
    for (const { value } of used) expect(AUDIT_ACTIONS).toContain(value);
  });

  it('every ticket history action is mapped to an audit event or is explicitly history-only', () => {
    const service = read(path.join(SRC, 'modules/tickets/tickets.service.ts'));
    const historyActions = new Set([...service.matchAll(/\baction:\s*'([a-z_]+)'/g)].map((m) => m[1]!));
    expect(historyActions.size).toBeGreaterThan(5);
    for (const action of historyActions) {
      const mapped = auditActionForHistory(action) !== undefined || HISTORY_ONLY_ACTIONS.includes(action);
      expect({ action, mapped }).toEqual({ action, mapped: true });
    }
  });

  it('every implemented event is produced somewhere in the code', () => {
    const code = files.map(read).join('\n');
    for (const action of AUDIT_ACTIONS) {
      const definition = AUDIT_EVENTS[action];
      if (!definition.implemented) continue;
      const viaHistory = 'historyAction' in definition && code.includes(`action: '${definition.historyAction}'`);
      const direct = code.includes(`'${action}'`);
      const dynamicKnowledge = action.startsWith('knowledge.') && code.includes('`knowledge.${status}`');
      expect({ action, produced: viaHistory || direct || dynamicKnowledge }).toEqual({ action, produced: true });
    }
  });

  it('reserved AI events distinguish proposal, review, approval and application', () => {
    const reserved = AUDIT_ACTIONS.filter((action) => !AUDIT_EVENTS[action].implemented);
    expect(reserved).toEqual(
      expect.arrayContaining([
        'ai.suggestion_generated',
        'ai.suggestion_reviewed',
        'ai.suggestion_approved',
        'ai.suggestion_applied',
      ]),
    );
  });

  it('failed attempts are flagged as rejected, never as applied changes', () => {
    expect(AUDIT_EVENTS['auth.login_failed'].outcome).toBe('rejected');
    expect(AUDIT_EVENTS['ticket.status_changed'].outcome).toBe('applied');
  });
});
