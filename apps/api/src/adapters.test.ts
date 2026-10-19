import { createAIProvider } from './modules/ai';
import { createStorageProvider } from './modules/files';
import { notify, registerChannel } from './modules/notifications';
import { resetChannels } from './modules/notifications/notifications.service';

/** Contratos de los adaptadores externos (NFR-007): se prueban sin proveedores reales. */
describe('external adapters', () => {
  it('AI provider defaults to the mock and answers without network calls', async () => {
    const answer = await createAIProvider().ask('How do I reset my VPN?', [{ articleId: 7, content: 'x' }]);
    expect(answer).toMatchObject({ sources: [7], aiGenerated: true });
  });

  it('AI provider flags an unregistered provider instead of silently falling back', () => {
    expect(() => createAIProvider('unknown')).toThrow(/AI_PROVIDER/);
  });

  it('storage provider stores, reads and deletes objects behind the interface', async () => {
    const storage = createStorageProvider();
    const stored = await storage.put('a/1.txt', Buffer.from('hola'), 'text/plain');
    expect(stored).toEqual({ key: 'a/1.txt', size: 4, contentType: 'text/plain' });
    expect((await storage.get('a/1.txt'))?.toString()).toBe('hola');
    await storage.delete('a/1.txt');
    expect(await storage.get('a/1.txt')).toBeUndefined();
    expect(() => createStorageProvider('unknown')).toThrow(/STORAGE_PROVIDER/);
  });

  it('a failing notification channel never breaks the notifying operation', async () => {
    const delivered: string[] = [];
    registerChannel({ deliver: (n) => void delivered.push(n.type) });
    registerChannel({
      deliver: () => {
        throw new Error('smtp down');
      },
    });
    expect(() => notify(1, 'ticket.updated', 'hola')).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(delivered).toEqual(['ticket.updated']);
    resetChannels();
  });
});
