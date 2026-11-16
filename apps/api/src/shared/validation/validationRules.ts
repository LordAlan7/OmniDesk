/**
 * Diccionario centralizado de validaciones (NFR-010).
 *
 * Fuente única de verdad para longitudes, formatos y reglas de validación
 * de campos compartidos entre módulos.
 *
 * Cuándo agregar una regla aquí:
 * - Si el campo aparece en 2+ módulos (ej. `email`).
 * - Si el límite es "de negocio" y no viene del tipo (ej. título 3-200 chars).
 *
 * Cuándo NO ponerla aquí:
 * - Reglas que dependen de un catálogo (ej. `status IN (...)`): van en types.
 * - Reglas condicionales complejas: van en lifecycle.ts de cada módulo.
 */

/** Límites de longitud de strings por campo. */
export const STRING_LIMITS = {
  // Usuarios
  userName: { min: 2, max: 120 },
  userEmail: { min: 5, max: 254 }, // RFC 5321
  userPassword: { min: 10, max: 128 },

  // Tickets
  ticketTitle: { min: 3, max: 200 },
  ticketDescription: { min: 1, max: 5000 },
  ticketResolution: { min: 5, max: 5000 },
  ticketCloseComment: { min: 0, max: 1000 },
} as const;

/** Mensajes de error estandarizados en español. */
export const MESSAGES = {
  required: (field: string) => `${field} es obligatorio.`,
  tooShort: (field: string, min: number) =>
    `${field} debe tener al menos ${min} caracteres.`,
  tooLong: (field: string, max: number) =>
    `${field} no puede exceder ${max} caracteres.`,
  invalidEmail: 'El correo no tiene un formato válido.',
  invalidEnum: (field: string, allowed: readonly string[]) =>
    `${field} debe ser uno de: ${allowed.join(', ')}.`,
  positiveInt: (field: string) => `${field} debe ser un entero positivo.`,
  noFieldsToUpdate: 'Debes enviar al menos un campo para actualizar.',
  duplicateRoles: 'No se permiten roles duplicados.',
  atLeastOneRole: 'Selecciona al menos un rol.',
  invalidDate: (field: string) =>
    `${field} debe ser una fecha ISO 8601 válida.`,
} as const;

/**
 * Reglas de unicidad y normalización documentadas.
 * Cuando migremos a PostgreSQL, cada una se convierte en un constraint.
 */
export const UNIQUENESS_RULES = {
  userEmail: {
    description: 'El email debe ser único, case-insensitive y trimmeado.',
    sql: 'CREATE UNIQUE INDEX ... ON users (lower(btrim(email)))',
  },
} as const;

/**
 * Reglas condicionales (se aplican en services/lifecycle, no en schemas).
 * Documentadas aquí para referencia única.
 */
export const CONDITIONAL_RULES = [
  {
    entity: 'Ticket',
    rule: 'Si status === "Resolved", resolution NO debe ser null.',
    enforcedIn: 'tickets.lifecycle.ts',
  },
  {
    entity: 'Ticket',
    rule: 'Si status === "Closed", closedAt NO debe ser null.',
    enforcedIn: 'tickets.lifecycle.ts',
  },
  {
    entity: 'Ticket',
    rule: 'Si status === "Open", assignedTechnicianId DEBE ser null.',
    enforcedIn: 'tickets.lifecycle.ts',
  },
  {
    entity: 'Ticket',
    rule: 'Si status === "Assigned", assignedTechnicianId NO debe ser null.',
    enforcedIn: 'tickets.lifecycle.ts',
  },
  {
    entity: 'User',
    rule: 'No se puede desactivar un técnico con tickets sin cerrar.',
    enforcedIn: 'users.lifecycle.ts',
  },
] as const;