const SENSITIVE_KEYS =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|hash/i;

/** Descripción segura de un error para logs: nunca incluye credenciales ni parámetros de consultas. */
export function safeErrorLog(err: unknown): Record<string, unknown> {
  // Se usa una comprobación estructural: `instanceof Error` falla entre contextos (p. ej. Jest, AggregateError).
  if (typeof err !== 'object' || err === null || !('message' in err)) return { error: typeof err };

  const { code } = err as { code?: unknown };

  const { name, message, stack } = err as Error;

  return {
    name,
    message,
    code: typeof code === 'string' ? code : undefined,
    stack,
  };
}

/** Copia un objeto ocultando los valores de campos sensibles (para metadata de logs/auditoría). */
export function redactSensitive<T>(value: T, depth = 0): T {
  if (depth > 5 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [
      key,
      SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redactSensitive(v, depth + 1),
    ]),
  ) as T;
}
