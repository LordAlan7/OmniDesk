import { redactSensitive, safeErrorLog } from './redact';

describe('redact', () => {
  it('hides sensitive fields recursively', () => {
    expect(
      redactSensitive({ email: 'a@b.c', password: 'x', nested: { accessToken: 'y', ok: 1 } }),
    ).toEqual({ email: 'a@b.c', password: '[REDACTED]', nested: { accessToken: '[REDACTED]', ok: 1 } });
  });

  it('logs only name, message, code and stack of an error', () => {
    const err = Object.assign(new Error('boom'), { parameters: ['secret'] });
    const log = safeErrorLog(err);
    expect(log.message).toBe('boom');
    expect(JSON.stringify(log)).not.toContain('secret');
  });
});
