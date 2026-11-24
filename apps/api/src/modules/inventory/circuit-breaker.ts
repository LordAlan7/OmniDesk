/** Marcador interno: el circuito está abierto y aún no toca reintentar. */
export class CircuitOpenError extends Error {
  constructor() {
    super('circuit-open');
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker del adaptador de inventario (§9):
 * - Abierto tras `threshold` fallos consecutivos de red/5xx/429 (los 4xx no cuentan).
 * - Tras `resetMs` pasa a semiabierto y deja pasar UNA petición de prueba:
 *   si falla vuelve a abrirse; si funciona, se cierra.
 */
export class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private openedAt = 0;

  constructor(
    private readonly threshold: number,
    private readonly resetMs: number,
  ) {}

  ensureAvailable(): void {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.resetMs) {
        this.state = 'half-open';
      } else {
        throw new CircuitOpenError();
      }
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.threshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }
}