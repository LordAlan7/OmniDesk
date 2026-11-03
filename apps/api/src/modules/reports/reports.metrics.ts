/**
 * NFR-012: Diccionario formal de métricas.
 *
 * Cada métrica documenta:
 * - `id`: identificador único.
 * - `label`: nombre legible.
 * - `formula`: cómo se calcula (en lenguaje natural + SQL equivalente).
 * - `population`: qué registros entran en el cálculo.
 * - `dateReference`: qué fecha se usa como referencia.
 * - `exclusions`: qué registros se excluyen y por qué.
 * - `reopenedHandling`: cómo se tratan las reaperturas.
 * - `unit`: unidad del resultado (conteo, porcentaje, etc.).
 * - `rounding`: regla de redondeo.
 * - `missingData`: qué se devuelve cuando no hay datos.
 *
 * Este catálogo es la fuente de verdad para NFR-012. Las vistas (FR-016) y los
 * informes (FR-017) deben usar estas definiciones para garantizar consistencia.
 */

export interface MetricDefinition {
  id: string;
  label: string;
  formula: string;
  sqlEquivalent: string;
  population: string;
  dateReference: string;
  exclusions: string[];
  reopenedHandling: string;
  unit: 'count' | 'percentage';
  rounding: string;
  missingData: string;
}

export const METRICS_DICTIONARY: MetricDefinition[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // Overview metrics (FR-016)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'total',
    label: 'Total de tickets',
    formula: 'COUNT(*) de todos los tickets en la tabla tickets.',
    sqlEquivalent: 'SELECT COUNT(*) FROM tickets',
    population: 'Todos los tickets, sin distinción de estado.',
    dateReference: 'No aplica (conteo total, no temporal).',
    exclusions: ['Ninguna. Se incluyen todos los estados.'],
    reopenedHandling: 'Un ticket reabierto sigue siendo el mismo ticket; no se cuenta dos veces.',
    unit: 'count',
    rounding: 'Entero exacto (sin decimales).',
    missingData: 'Si no hay tickets, devuelve 0 (no null).',
  },
  {
    id: 'open',
    label: 'Tickets abiertos',
    formula: 'COUNT(*) WHERE status = \'Open\'.',
    sqlEquivalent: "SELECT COUNT(*) FROM tickets WHERE status = 'Open'",
    population: 'Tickets en estado Open.',
    dateReference: 'No aplica (estado actual).',
    exclusions: ['Tickets en Assigned, In Progress, Resolved o Closed.'],
    reopenedHandling: 'Un ticket reabierto pasa a In Progress, no a Open; no afecta esta métrica.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay tickets abiertos, devuelve 0.',
  },
  {
    id: 'assigned',
    label: 'Tickets asignados',
    formula: 'COUNT(*) WHERE status = \'Assigned\'.',
    sqlEquivalent: "SELECT COUNT(*) FROM tickets WHERE status = 'Assigned'",
    population: 'Tickets en estado Assigned.',
    dateReference: 'No aplica (estado actual).',
    exclusions: ['Tickets en Open, In Progress, Resolved o Closed.'],
    reopenedHandling: 'Un ticket reabierto pasa a In Progress; no afecta esta métrica.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay tickets asignados, devuelve 0.',
  },
  {
    id: 'inProgress',
    label: 'Tickets en progreso',
    formula: 'COUNT(*) WHERE status = \'In Progress\'.',
    sqlEquivalent: "SELECT COUNT(*) FROM tickets WHERE status = 'In Progress'",
    population: 'Tickets en estado In Progress.',
    dateReference: 'No aplica (estado actual).',
    exclusions: ['Tickets en Open, Assigned, Resolved o Closed.'],
    reopenedHandling: 'Un ticket reabierto desde Resolved pasa a In Progress; se cuenta aquí.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay tickets en progreso, devuelve 0.',
  },
  {
    id: 'resolved',
    label: 'Tickets resueltos',
    formula: 'COUNT(*) WHERE status = \'Resolved\'.',
    sqlEquivalent: "SELECT COUNT(*) FROM tickets WHERE status = 'Resolved'",
    population: 'Tickets en estado Resolved.',
    dateReference: 'No aplica (estado actual).',
    exclusions: ['Tickets en Open, Assigned, In Progress o Closed.'],
    reopenedHandling: 'Un ticket reabierto deja de estar Resolved; ya no se cuenta aquí.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay tickets resueltos, devuelve 0.',
  },
  {
    id: 'closed',
    label: 'Tickets cerrados',
    formula: 'COUNT(*) WHERE status = \'Closed\'.',
    sqlEquivalent: "SELECT COUNT(*) FROM tickets WHERE status = 'Closed'",
    population: 'Tickets en estado Closed.',
    dateReference: 'No aplica (estado actual).',
    exclusions: ['Tickets en Open, Assigned, In Progress o Resolved.'],
    reopenedHandling: 'Un ticket cerrado no puede reabrirse (FR-009); no afecta esta métrica.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay tickets cerrados, devuelve 0.',
  },
  {
    id: 'overdue',
    label: 'Tickets vencidos',
    formula: 'COUNT(*) WHERE status NOT IN (\'Resolved\', \'Closed\') AND due_date IS NOT NULL AND due_date < CURRENT_TIMESTAMP.',
    sqlEquivalent: "SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved', 'Closed') AND due_date IS NOT NULL AND due_date < CURRENT_TIMESTAMP",
    population: 'Tickets activos (no resueltos ni cerrados) con plazo definido que ya venció.',
    dateReference: 'CURRENT_TIMESTAMP del servidor PostgreSQL (zona UTC).',
    exclusions: ['Tickets en Resolved o Closed (dejaron de contar).', 'Tickets sin due_date (no tienen plazo).'],
    reopenedHandling: 'Un ticket reabierto vuelve a contar como vencido si su plazo ya pasó.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay tickets vencidos, devuelve 0.',
  },
  {
    id: 'unassigned',
    label: 'Tickets sin asignar',
    formula: 'COUNT(*) WHERE status NOT IN (\'Resolved\', \'Closed\') AND assigned_technician_id IS NULL.',
    sqlEquivalent: "SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved', 'Closed') AND assigned_technician_id IS NULL",
    population: 'Tickets activos sin técnico asignado.',
    dateReference: 'No aplica (estado actual).',
    exclusions: ['Tickets en Resolved o Closed.', 'Tickets con técnico asignado.'],
    reopenedHandling: 'Un ticket reabierto sin asignar cuenta aquí.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay tickets sin asignar, devuelve 0.',
  },
  {
    id: 'withoutPriority',
    label: 'Tickets sin prioridad',
    formula: 'COUNT(*) WHERE status NOT IN (\'Resolved\', \'Closed\') AND priority_id IS NULL.',
    sqlEquivalent: "SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved', 'Closed') AND priority_id IS NULL",
    population: 'Tickets activos sin prioridad asignada.',
    dateReference: 'No aplica (estado actual).',
    exclusions: ['Tickets en Resolved o Closed.', 'Tickets con prioridad asignada.'],
    reopenedHandling: 'Un ticket reabierto sin prioridad cuenta aquí.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay tickets sin prioridad, devuelve 0.',
  },
  {
    id: 'byPriority',
    label: 'Distribución por prioridad',
    formula: 'COUNT(*) GROUP BY priority_id.',
    sqlEquivalent: 'SELECT priority_id, COUNT(*) FROM tickets GROUP BY priority_id',
    population: 'Todos los tickets, agrupados por prioridad.',
    dateReference: 'No aplica (estado actual).',
    exclusions: ['Ninguna. Se incluyen todos los estados en la agrupación.'],
    reopenedHandling: 'Un ticket reabierto se cuenta en su prioridad actual.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay tickets, devuelve array vacío. priority_id NULL se incluye como un grupo.',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Workload metrics (FR-016)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'workload',
    label: 'Carga de trabajo por técnico',
    formula: 'COUNT(*) WHERE status NOT IN (\'Resolved\', \'Closed\') AND assigned_technician_id IS NOT NULL GROUP BY assigned_technician_id.',
    sqlEquivalent: "SELECT assigned_technician_id, COUNT(*) FROM tickets WHERE status NOT IN ('Resolved', 'Closed') AND assigned_technician_id IS NOT NULL GROUP BY assigned_technician_id",
    population: 'Tickets activos asignados a un técnico.',
    dateReference: 'No aplica (estado actual).',
    exclusions: ['Tickets en Resolved o Closed.', 'Tickets sin técnico asignado.'],
    reopenedHandling: 'Un ticket reabierto asignado a un técnico cuenta en su carga actual.',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay técnicos con tickets pendientes, devuelve array vacío.',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Activity metrics (FR-016)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'activity',
    label: 'Actividad de tickets por día',
    formula: 'COUNT(*) y COUNT(DISTINCT ticket_id) de eventos en ticket_history, agrupados por día (zona America/Monterrey).',
    sqlEquivalent: "SELECT (created_at AT TIME ZONE 'America/Monterrey')::date AS activity_date, COUNT(*) AS activities, COUNT(DISTINCT ticket_id) AS tickets FROM ticket_history GROUP BY activity_date",
    population: 'Eventos del historial de tickets (ticket_history).',
    dateReference: 'created_at de ticket_history, convertida a America/Monterrey.',
    exclusions: ['Eventos fuera del rango de fechas solicitado.'],
    reopenedHandling: 'Cada reapertura genera un evento "reopened" en ticket_history; se cuenta como una actividad ese día. El ticket se cuenta una vez por día (DISTINCT).',
    unit: 'count',
    rounding: 'Entero exacto.',
    missingData: 'Si no hay actividad en un día, ese día no aparece en el resultado (no se rellena con ceros). La interfaz debe indicar la ausencia de datos.',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Report tickets (FR-016)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'tickets',
    label: 'Listado de tickets para reportes',
    formula: 'SELECT de tickets con filtros opcionales (status, priorityId, technicianId, from, to), paginado.',
    sqlEquivalent: 'SELECT * FROM tickets WHERE [filtros] ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    population: 'Tickets que cumplen los filtros aplicados.',
    dateReference: 'created_at del ticket, interpretada en America/Monterrey para los filtros from/to.',
    exclusions: ['Tickets fuera del rango de fechas si se especifica from/to.'],
    reopenedHandling: 'Un ticket reabierto aparece una sola vez (es el mismo ticket). El estado actual es el que se muestra.',
    unit: 'count',
    rounding: 'Entero exacto para el total. La lista contiene los campos completos del ticket.',
    missingData: 'Si no hay tickets que cumplan los filtros, devuelve total=0 y items=[].',
  },
];

/**
 * Devuelve la definición de una métrica por su id.
 */
export function getMetricDefinition(id: string): MetricDefinition | undefined {
  return METRICS_DICTIONARY.find((m) => m.id === id);
}

/**
 * Lista todos los ids de métricas definidas.
 */
export const METRIC_IDS = METRICS_DICTIONARY.map((m) => m.id);