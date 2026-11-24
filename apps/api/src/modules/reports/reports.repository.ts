
import { getPool } from '../../shared/db/pool';

export interface OverviewMetrics {
  total: number;
  open: number;
  assigned: number;
  inProgress: number;
  resolved: number;
  closed: number;
  overdue: number;
  unassigned: number;
  withoutPriority: number;
  byPriority: {
    priorityId: number | null;
    total: number;
  }[];
}

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const result = await getPool().query<OverviewMetrics>(`
    SELECT
      COUNT(*)::integer AS total,

      COUNT(*) FILTER (
        WHERE status = 'Open'
      )::integer AS open,

      COUNT(*) FILTER (
        WHERE status = 'Assigned'
      )::integer AS assigned,

      COUNT(*) FILTER (
        WHERE status = 'In Progress'
      )::integer AS "inProgress",

      COUNT(*) FILTER (
        WHERE status = 'Resolved'
      )::integer AS resolved,

      COUNT(*) FILTER (
        WHERE status = 'Closed'
      )::integer AS closed,

      COUNT(*) FILTER (
        WHERE status NOT IN ('Resolved', 'Closed')
          AND due_date IS NOT NULL
          AND due_date < CURRENT_TIMESTAMP
      )::integer AS overdue,

      COUNT(*) FILTER (
        WHERE status NOT IN ('Resolved', 'Closed')
          AND assigned_technician_id IS NULL
      )::integer AS unassigned,

      COUNT(*) FILTER (
        WHERE status NOT IN ('Resolved', 'Closed')
          AND priority_id IS NULL
      )::integer AS "withoutPriority",

      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'priorityId', priority_id,
              'total', cantidad
            )
            ORDER BY priority_id NULLS FIRST
          )
          FROM (
            SELECT
              priority_id,
              COUNT(*)::integer AS cantidad
            FROM tickets
            GROUP BY priority_id
          ) prioridades
        ),
        '[]'::jsonb
      ) AS "byPriority"

    FROM tickets
  `);

  const metrics = result.rows[0];

  if (!metrics) {
    throw new Error(
      'No se pudieron consultar las metricas.'
    );
  }

  return metrics;
}

export interface TechnicianWorkload {
  technicianId: number;
  pendingTickets: number;
}

/**
 * FR-016: carga actual de trabajo por técnico.
 * No incluye tickets resueltos ni cerrados.
 */
export async function getWorkloadMetrics(): Promise<TechnicianWorkload[]> {
  const result = await getPool().query<TechnicianWorkload>(`
    SELECT
      assigned_technician_id AS "technicianId",
      COUNT(*)::integer AS "pendingTickets"
    FROM tickets
    WHERE status NOT IN ('Resolved', 'Closed')
      AND assigned_technician_id IS NOT NULL
    GROUP BY assigned_technician_id
    ORDER BY "pendingTickets" DESC, "technicianId" ASC
  `);

  return result.rows;
}

/**
 * FR-016: filtros para consultar tickets del panel.
 */
export interface ReportTicketFilters {
  status?: string;
  priorityId?: number;
  technicianId?: number;
  vehicleVin?: string;
  vehicleModelId?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export interface ReportTicket {
  id: number;
  title: string;
  status: string;
  priorityId: number | null;
  technicianId: number | null;
  createdAt: string;
  dueDate: string | null;
  vehicleVin: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
}

export interface ReportTicketsResult {
  total: number;
  items: ReportTicket[];
}

/**
 * FR-016: listado paginado y filtrado de tickets.
 * Los valores se envían como parámetros SQL.
 */
export async function getReportTickets(
  filters: ReportTicketFilters,
): Promise<ReportTicketsResult> {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  function parameter(value: string | number): string {
    values.push(value);
    return `$${values.length}`;
  }

  if (filters.status) {
    conditions.push(
      `t.status = ${parameter(filters.status)}`
    );
  }

  if (filters.priorityId !== undefined) {
    conditions.push(
      `t.priority_id = ${parameter(filters.priorityId)}`
    );
  }

  if (filters.technicianId !== undefined) {
    conditions.push(
      `t.assigned_technician_id = ${parameter(filters.technicianId)}`
    );
  }

  if (filters.vehicleVin) {
    conditions.push(
      `t.vehicle_vin = ${parameter(filters.vehicleVin)}`
    );
  }

  if (filters.vehicleModelId) {
    conditions.push(
      `t.vehicle_model_id = ${parameter(filters.vehicleModelId)}`
    );
  }

  if (filters.from) {
    conditions.push(
      `t.created_at >= (${parameter(filters.from)}::date AT TIME ZONE 'America/Monterrey')`
    );
  }

  if (filters.to) {
    conditions.push(
      `t.created_at < ((${parameter(filters.to)}::date + INTERVAL '1 day') AT TIME ZONE 'America/Monterrey')`
    );
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const limitParameter = parameter(filters.limit);
  const offsetParameter = parameter(filters.offset);

  const result = await getPool().query<ReportTicketsResult>(`
    WITH filtered AS (
      SELECT
        t.id,
        t.title,
        t.status,
        t.priority_id,
        t.assigned_technician_id,
        t.created_at,
        t.due_date,
        t.vehicle_vin,
        t.vehicle_brand,
        t.vehicle_model,
        t.vehicle_year
      FROM tickets t
      ${whereClause}
    ),
    paged AS (
      SELECT *
      FROM filtered
      ORDER BY created_at DESC, id DESC
      LIMIT ${limitParameter}
      OFFSET ${offsetParameter}
    )
    SELECT
      (SELECT COUNT(*)::integer FROM filtered) AS total,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'title', p.title,
              'status', p.status,
              'priorityId', p.priority_id,
              'technicianId', p.assigned_technician_id,
              'createdAt', p.created_at,
              'dueDate', p.due_date,
              'vehicleVin', p.vehicle_vin,
              'vehicleBrand', p.vehicle_brand,
              'vehicleModel', p.vehicle_model,
              'vehicleYear', p.vehicle_year
            )
            ORDER BY p.created_at DESC, p.id DESC
          )
          FROM paged p
        ),
        '[]'::jsonb
      ) AS items
  `, values);

  return result.rows[0] ?? {
    total: 0,
    items: [],
  };
}

/**
 * FR-016: filtros de actividad por periodo.
 */
export interface ActivityFilters {
  from?: string;
  to?: string;
}

/**
 * Cantidad de actividades y tickets distintos
 * que tuvieron actividad en cada día.
 */
export interface DailyTicketActivity {
  date: string;
  activities: number;
  tickets: number;
}

/**
 * FR-016: actividad de soporte por día.
 *
 * Por defecto consulta los últimos 30 días.
 * Los rangos se interpretan en America/Monterrey.
 */
export async function getTicketActivityMetrics(
  filters: ActivityFilters = {},
): Promise<DailyTicketActivity[]> {
  const result = await getPool().query<DailyTicketActivity>(
    `
    WITH period AS (
      SELECT
        COALESCE(
          $1::date,
          COALESCE(
            $2::date,
            (CURRENT_TIMESTAMP AT TIME ZONE 'America/Monterrey')::date
          ) - 29
        ) AS from_date,

        COALESCE(
          $2::date,
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Monterrey')::date
        ) AS to_date
    ),
    activity AS (
      SELECT
        (h.created_at AT TIME ZONE 'America/Monterrey')::date
          AS activity_date,
        h.ticket_id
      FROM ticket_history h
      CROSS JOIN period p
      WHERE h.created_at >= (
        p.from_date::timestamp
        AT TIME ZONE 'America/Monterrey'
      )
      AND h.created_at < (
        (p.to_date + 1)::timestamp
        AT TIME ZONE 'America/Monterrey'
      )
    )
    SELECT
      TO_CHAR(activity_date, 'YYYY-MM-DD') AS "date",
      COUNT(*)::integer AS activities,
      COUNT(DISTINCT ticket_id)::integer AS tickets
    FROM activity
    GROUP BY activity_date
    ORDER BY activity_date ASC
    `,
    [
      filters.from ?? null,
      filters.to ?? null,
    ],
  );

  return result.rows;
}

// ──────────────────────────────────────────────────────────────────────────
// NFR-012: Advertencias de calidad de datos
// ──────────────────────────────────────────────────────────────────────────

export interface DataQualityWarning {
  metric: string;
  message: string;
  count: number;
}

/**
 * NFR-012: Identifica datos faltantes que podrían afectar la interpretación
 * de los reportes. No bloquea la generación; solo informa.
 *
 * - Tickets activos sin prioridad: podrían no aparecer correctamente en
 *   la distribución por prioridad.
 * - Tickets activos sin técnico: no contribuyen a la carga de trabajo.
 * - Tickets activos sin plazo: no se pueden evaluar como vencidos.
 */
export async function getDataQualityWarnings(): Promise<DataQualityWarning[]> {
  const result = await getPool().query<DataQualityWarning>(`
    SELECT
      'withoutPriority' AS metric,
      'Tickets activos sin prioridad asignada' AS message,
      COUNT(*)::integer AS count
    FROM tickets
    WHERE status NOT IN ('Resolved', 'Closed')
      AND priority_id IS NULL

    UNION ALL

    SELECT
      'unassigned' AS metric,
      'Tickets activos sin técnico asignado' AS message,
      COUNT(*)::integer AS count
    FROM tickets
    WHERE status NOT IN ('Resolved', 'Closed')
      AND assigned_technician_id IS NULL

    UNION ALL

    SELECT
      'withoutDeadline' AS metric,
      'Tickets activos sin plazo definido' AS message,
      COUNT(*)::integer AS count
    FROM tickets
    WHERE status NOT IN ('Resolved', 'Closed')
      AND due_date IS NULL
  `);

  // Filtrar solo las advertencias con count > 0
  return result.rows.filter((w) => w.count > 0);
}