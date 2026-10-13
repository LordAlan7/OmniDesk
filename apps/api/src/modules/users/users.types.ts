import { Role } from '../../shared/types';

export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  roles: Role[];
  active: boolean;
  createdAt: string;
}

/** Usuario sin datos sensibles: es lo único que sale del módulo. */
export type PublicUser = Omit<User, 'passwordHash'>;
