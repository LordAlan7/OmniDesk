/**
 * Estados y prioridades provisionales.
 * Pendientes de validación con las reglas del proyecto.
 */
export const TICKET_STATUSES = [
  'Open',
  'Assigned',
  'In Progress',
  'Resolved',
  'Closed',
] as const;

export type TicketStatus =
  (typeof TICKET_STATUSES)[number];

export const PRIORITIES: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
};

export interface Ticket {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  priorityId: number | null;
  status: TicketStatus;
  createdBy: number;
  assignedTechnicianId: number | null;
  assignedTechnicianName?: string | null;
  /** Calculado al consultar (FR-008); no se persiste. */
  isOverdue?: boolean;
  dueDate: string | null;
  resolution: string | null;
  /** FR-009: comprobación del resultado (obligatoria al resolver). */
  resolutionVerification: string | null;
  /** FR-009: causa identificada (opcional; no se obliga al técnico a inventarla). */
  rootCause: string | null;
  /** FR-009: observaciones complementarias de la resolución (opcional). */
  resolutionObservations: string | null;
  /** FR-009: referencia opcional al artículo de conocimiento (FR-011) utilizado. */
  knowledgeArticleId: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  version: number;
  storeLocation: string | null;
  motorcycleModel: string | null;
}

export interface TicketHistoryEntry {
  id: number;
  ticketId: number;
  actorId: number;
  action: string;
  from?: unknown;
  to?: unknown;
  reason?: string | null;
  /** Identificador de la petición que originó el evento (NFR-009). */
  correlationId?: string | null;
  createdAt: string;
}

export interface Priority {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
}

/** FR-009: actividad de investigación registrada por un técnico sobre un ticket. */
export interface TicketInvestigation {
  id: number;
  ticketId: number;
  authorId: number;
  /** Nombre del autor, resuelto por el servidor (solo en respuestas internas). */
  authorName?: string | null;
  /** Actividad o prueba realizada (1–5000 caracteres). */
  activity: string;
  /** Resultado observado (1–5000 caracteres). */
  result: string;
  /** Referencia opcional al artículo de conocimiento (FR-011) utilizado. */
  knowledgeArticleId: number | null;
  /** Título del artículo, resuelto por el servidor cuando hay referencia. */
  knowledgeArticleTitle?: string | null;
  createdAt: string;
}