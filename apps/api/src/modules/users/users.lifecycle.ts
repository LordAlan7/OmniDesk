import { Errors } from '../../shared/errors';

type PendingTicketsChecker = (
  technicianId: number,
) => boolean | Promise<boolean>;

let checkPendingTickets: PendingTicketsChecker | undefined;

// NFR-008 (Escalabilidad): estado in-process por instancia.
//
// `queues` serializa operaciones que afectan a un mismo técnico (asignación de
// tickets, desactivación de cuenta, cambio de roles). Sin esta cola, dos
// peticiones concurrentes que asignan tickets al mismo técnico podrían leer
// el mismo estado y generar inconsistencias.
//
// ⚠️ Limitación de multi-instancia: esta cola solo coordina dentro de un proceso.
// Si dos instancias asignan tickets al mismo técnico simultáneamente, no se
// coordinan entre sí.
//
// Mitigación actual (aceptable para single-instance):
//   - El control de concurrencia optimista (`version` en la tabla `tickets`)
//     SÍ funciona entre instancias: si dos peticiones intentan modificar el
//     mismo ticket, una recibe 409 CONFLICT porque la versión no coincide.
//   - La cola evita que dos peticiones lean el mismo estado del técnico ANTES
//     de guardar. Sin cola, la race condition es: leer pendientes → asignar →
//     guardar. Con cola, se serializa: leer → asignar → guardar → siguiente.
//   - El riesgo real es mínimo: con < 6 técnicos, la probabilidad de dos
//     asignaciones simultáneas al mismo técnico en instancias distintas es baja.
//
// Ruta de migración a multi-instancia (cuando se necesite):
//   - Usar `SELECT ... FOR UPDATE` en la tabla `users` dentro de la transacción
//     para bloquear la fila del técnico mientras se comprueban sus tickets
//     pendientes. Esto coordina entre instancias a nivel de BD.
//   - Alternativa: advisory locks de PostgreSQL (`pg_advisory_xact_lock`).
//
// Ver docs/NFR-008-Scalability.md para el procedimiento de ampliación.
const queues = new Map<number, Promise<void>>();

export function configurePendingTicketsChecker(
  checker: PendingTicketsChecker,
): void {
  checkPendingTickets = checker;
}

export async function assertNoPendingTickets(
  technicianId: number,
): Promise<void> {
  if (!checkPendingTickets) {
    throw new Error(
      'No está configurada la comprobación de tickets pendientes.',
    );
  }

  if (await checkPendingTickets(technicianId)) {
    throw Errors.conflict(
      'No se puede desactivar esta cuenta ni quitarle el rol de técnico mientras tenga tickets sin cerrar. Deben atenderse o reasignarse mediante el flujo autorizado.',
    );
  }
}

export async function withTechnicianLifecycleLock<T>(
  userId: number,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(userId) ?? Promise.resolve();

  let release!: () => void;

  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  queues.set(userId, current);

  await previous;

  try {
    return await operation();
  } finally {
    release();

    if (queues.get(userId) === current) {
      queues.delete(userId);
    }
  }
}