/**
 * FR-017: Tipos de informe disponibles.
 * El catálogo es estático (definido en código), pero los datos son dinámicos.
 */
export type ReportType =
  | 'overview'
  | 'tickets'
  | 'workload'
  | 'activity';

export interface ReportDefinition {
  type: ReportType;
  label: string;
  description: string;
  /** Permiso requerido para generarlo. */
  permission: string;
  /** Campos de filtro aceptados. */
  filters: string[];
}

export interface ReportResult {
  type: ReportType;
  generatedAt: string;
  filters: Record<string, unknown>;
  data: unknown;
  limitations: string[];
}