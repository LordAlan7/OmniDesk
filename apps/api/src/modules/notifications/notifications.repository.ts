import type {
  Notification,
  NotificationInput,
  NotificationPage,
  NotificationFilters,
} from './notifications.types';

// ──────────────────────────────────────────────────────────────────────────────
// Implementación en memoria (tests y desarrollo sin BD)
// ──────────────────────────────────────────────────────────────────────────────
const store: Notification[] = [];
let nextId = 1;

export const memoryNotificationsRepository = {
  /**
   * Inserta una notificación. Si la dedup_key ya existe, no hace nada
   * (decisión 7: dos envíos del mismo evento se ignoran).
   */
  add(input: NotificationInput): Notification | null {
    const existing = store.find((n) => n.dedupKey === input.dedupKey);
    if (existing) return null;

    const record: Notification = {
      id: nextId++,
      userId: input.userId,
      ticketId: input.ticketId,
      eventType: input.eventType,
      message: input.message,
      refEntity: input.refEntity ?? 'ticket',
      refId: input.refId ?? input.ticketId,
      read: false,
      readAt: null,
      dedupKey: input.dedupKey,
      correlationId: input.correlationId ?? null,
      createdAt: new Date().toISOString(),
    };
    store.push(record);
    return record;
  },

  list(filters: NotificationFilters): NotificationPage {
    let matching = store
      .filter((n) => n.userId === filters.userId)
      .filter((n) => !filters.onlyUnread || !n.read)
      // Decisión 3: revalidación de acceso. Si accessibleTicketIds es null,
      // el usuario tiene TICKETS_READ_ALL y ve todo. Si es un array, solo
      // ve notificaciones de tickets a los que aún tiene acceso.
      // Las notificaciones con ticketId null (futuras extensiones) siempre visibles.
      .filter((n) =>
        filters.accessibleTicketIds === null ||
        n.ticketId === null ||
        filters.accessibleTicketIds.includes(n.ticketId),
      )
      .reverse();

    const total = matching.length;
    const start = (filters.page - 1) * filters.limit;
    const items = matching.slice(start, start + filters.limit);

    return { items, total };
  },

  unreadCount(userId: number, accessibleTicketIds: number[] | null): number {
    return store
      .filter((n) => n.userId === userId && !n.read)
      .filter((n) =>
        accessibleTicketIds === null ||
        n.ticketId === null ||
        accessibleTicketIds.includes(n.ticketId),
      )
      .length;
  },

  markRead(userId: number, id: number): Notification | undefined {
    const n = store.find((x) => x.id === id && x.userId === userId);
    if (n) {
      n.read = true;
      n.readAt = new Date().toISOString();
    }
    return n;
  },

  markAllRead(userId: number): number {
    const mine = store.filter((n) => n.userId === userId && !n.read);
    mine.forEach((n) => {
      n.read = true;
      n.readAt = new Date().toISOString();
    });
    return mine.length;
  },
};

export function resetNotificationsRepository(): void {
  store.length = 0;
  nextId = 1;
}