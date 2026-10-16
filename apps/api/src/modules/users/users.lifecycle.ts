import { Errors } from '../../shared/errors';

type PendingTicketsChecker = (
  technicianId: number,
) => boolean | Promise<boolean>;

let checkPendingTickets: PendingTicketsChecker | undefined;

// Cola por usuario para coordinar asignaciones y cambios de acceso
// dentro de esta instancia del servidor.
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