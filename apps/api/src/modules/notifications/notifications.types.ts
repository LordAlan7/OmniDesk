/** FR-020: notificación interna dirigida a un usuario sobre un ticket. */
export interface Notification {
  id: number;
  /** Destinatario. */
  userId: number;
  /** Ticket relacionado (nullable para futuras extensiones no-ticket). */
  ticketId: number | null;
  /** event_type: coincide con el historyAction del ticket (ver catálogo). */
  eventType: string;
  /** Mensaje breve, sin información interna. */
  message: string;
  /** Referencia al recurso para navegación. */
  refEntity: string;
  refId: number | null;
  /** Estado de lectura. */
  read: boolean;
  readAt: string | null;
  /** Clave de deduplicación. */
  dedupKey: string;
  /** correlation_id de la petición que originó el evento (NFR-009). */
  correlationId: string | null;
  createdAt: string;
}

/** Input para insertar una notificación (sin id, read, readAt, createdAt). */
export interface NotificationInput {
  userId: number;
  ticketId: number;
  eventType: string;
  message: string;
  refEntity?: string;
  refId?: number;
  dedupKey: string;
  correlationId?: string | null;
}

/** Filtros de consulta. */
export interface NotificationFilters {
  userId: number;
  onlyUnread?: boolean;
  /**
   * null = no filtrar por acceso (el usuario tiene TICKETS_READ_ALL).
   * number[] = solo notificaciones cuyo ticketId está en la lista.
   * Decisión 3: revalidación de acceso al consultar.
   */
  accessibleTicketIds: number[] | null;
  page: number;
  limit: number;
}

/** Resultado paginado. */
export interface NotificationPage {
  items: Notification[];
  total: number;
}