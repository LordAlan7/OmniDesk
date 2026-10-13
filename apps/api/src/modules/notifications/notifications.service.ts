export interface Notification {
  id: number;
  userId: number;
  type: string;
  message: string;
  ref?: { entity: string; id: number };
  read: boolean;
  createdAt: string;
}

// En memoria por ahora. El canal externo (correo/WhatsApp/otro) sigue como pregunta abierta #6.
const store: Notification[] = [];
let nextId = 1;

export function notify(
  userId: number,
  type: string,
  message: string,
  ref?: Notification['ref'],
): Notification {
  const n: Notification = {
    id: nextId++,
    userId,
    type,
    message,
    ref,
    read: false,
    createdAt: new Date().toISOString(),
  };
  store.push(n);
  return n;
}

export const listFor = (userId: number, onlyUnread = false) =>
  store.filter((n) => n.userId === userId && (!onlyUnread || !n.read)).reverse();

export function markRead(userId: number, id: number): Notification | undefined {
  const n = store.find((x) => x.id === id && x.userId === userId);
  if (n) n.read = true;
  return n;
}

export function markAllRead(userId: number): number {
  const mine = store.filter((n) => n.userId === userId && !n.read);
  mine.forEach((n) => (n.read = true));
  return mine.length;
}
