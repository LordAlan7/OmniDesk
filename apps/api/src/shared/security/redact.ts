const SENSITIVE_KEYS =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|hash|credential|customer|phone/i;

/** Paso 13: VIN como clave ('vin', 'vehicle_vin', 'vehicleVin'). No oculta claves como "province". */
const VIN_KEYS = [/^vin$|[_-]vin$/i, /[a-z]Vin$/];

const isSensitiveKey = (key: string): boolean =>
  SENSITIVE_KEYS.test(key) || VIN_KEYS.some((pattern) => pattern.test(key));

/** Paso 13: oculta cualquier VIN (17 caracteres, sin I, O, Q) que aparezca dentro de un texto. */
const VIN_IN_TEXT = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
const scrubVin = (text: string): string => text.replace(VIN_IN_TEXT, '[VIN]');

/** Descripción segura de un error para logs: nunca incluye credenciales ni parámetros de consultas. */
export function safeErrorLog(err: unknown): Record<string, unknown> {
  // Se usa una comprobación estructural: `instanceof Error` falla entre contextos (p. ej. Jest, AggregateError).
  if (typeof err !== 'object' || err === null || !('message' in err)) return { error: typeof err };

  const { code } = err as { code?: unknown };

  const { name, message, stack } = err as Error;

  return {
    name,
    message: typeof message === 'string' ? scrubVin(message) : message,
    code: typeof code === 'string' ? code : undefined,
    stack: typeof stack === 'string' ? scrubVin(stack) : stack,
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
      isSensitiveKey(key) ? '[REDACTED]' : redactSensitive(v, depth + 1),
    ]),
  ) as T;
}
