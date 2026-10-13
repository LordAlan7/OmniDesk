/** Roles definidos en la sección "Authorization" del documento de diseño. */
export const ROLES = [
  'Employee',
  'Technician',
  'Service Advisor',
  'Manager',
  'Administrator',
] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  roles: Role[];
}

export const hasRole = (user: AuthUser, ...roles: Role[]): boolean =>
  user.roles.some((r) => roles.includes(r));

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}
