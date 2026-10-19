import type { AuthUser, Role } from '../types';
import { PERMISSIONS } from './permissions';
import { permissionsForRoles, getAuthorizationMatrix } from './rolePermissions';
import { can, canAccessTicket } from './policy';

const user = (roles: Role[], id = 1): AuthUser => ({
  id,
  email: `user${id}@company.com`,
  name: `User ${id}`,
  roles,
});

describe('NFR-001 · matriz de autorización', () => {
  it('cada rol del sistema tiene una entrada en la matriz', () => {
    const matrix = getAuthorizationMatrix();
    expect(Object.keys(matrix).sort()).toEqual(
      ['Administrator', 'Employee', 'Manager', 'Service Advisor', 'Technician'].sort(),
    );
  });

  describe('separación de deberes', () => {
    it('Administrator gestiona cuentas, no negocio', () => {
      const p = permissionsForRoles(['Administrator']);
      // Sí puede
      expect(p.has(PERMISSIONS.USERS_CREATE)).toBe(true);
      expect(p.has(PERMISSIONS.USERS_ASSIGN_ROLES)).toBe(true);
      expect(p.has(PERMISSIONS.AUDIT_READ)).toBe(true);
      // No puede
      expect(p.has(PERMISSIONS.TICKETS_ASSIGN)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_PRIORITY_UPDATE)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_RESOLVE)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_STATUS_UPDATE)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_CLOSE)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_READ_ALL)).toBe(false);
    });

    it('Manager prioriza, no asigna ni resuelve', () => {
      const p = permissionsForRoles(['Manager']);
      expect(p.has(PERMISSIONS.TICKETS_PRIORITY_UPDATE)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_READ_ALL)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_ASSIGN)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_RESOLVE)).toBe(false);
      expect(p.has(PERMISSIONS.USERS_CREATE)).toBe(false);
      expect(p.has(PERMISSIONS.AUDIT_READ)).toBe(true);
    });

    it('Service Advisor asigna y cierra, no cambia prioridad ni resuelve', () => {
      const p = permissionsForRoles(['Service Advisor']);
      expect(p.has(PERMISSIONS.TICKETS_ASSIGN)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_CLOSE)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_READ_ALL)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_PRIORITY_UPDATE)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_RESOLVE)).toBe(false);
    });

    it('Technician resuelve lo asignado, no asigna ni cierra', () => {
      const p = permissionsForRoles(['Technician']);
      expect(p.has(PERMISSIONS.TICKETS_RESOLVE)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_STATUS_UPDATE)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_UPDATE)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_ASSIGN)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_CLOSE)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_READ_ALL)).toBe(false);
    });

    it('Employee solo crea, lee los propios y usa IA', () => {
      const p = permissionsForRoles(['Employee']);
      expect(p.has(PERMISSIONS.TICKETS_CREATE)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_READ)).toBe(true);
      expect(p.has(PERMISSIONS.AI_QUERY)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_READ_ALL)).toBe(false);
      expect(p.has(PERMISSIONS.TICKETS_ASSIGN)).toBe(false);
      expect(p.has(PERMISSIONS.USERS_CREATE)).toBe(false);
      expect(p.has(PERMISSIONS.AUDIT_READ)).toBe(false);
    });
  });

  describe('combinación de roles (unión)', () => {
    it('Employee + Technician obtiene la unión', () => {
      const p = permissionsForRoles(['Employee', 'Technician']);
      expect(p.has(PERMISSIONS.TICKETS_CREATE)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_RESOLVE)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_ASSIGN)).toBe(false); // ninguno lo tiene
    });

    it('Employee + Manager hereda priorización sin asignar', () => {
      const p = permissionsForRoles(['Employee', 'Manager']);
      expect(p.has(PERMISSIONS.TICKETS_PRIORITY_UPDATE)).toBe(true);
      expect(p.has(PERMISSIONS.TICKETS_ASSIGN)).toBe(false);
    });
  });

  describe('can() · nivel función', () => {
    it('respeta la matriz', () => {
      expect(can(user(['Manager']), PERMISSIONS.TICKETS_PRIORITY_UPDATE)).toBe(true);
      expect(can(user(['Employee']), PERMISSIONS.TICKETS_PRIORITY_UPDATE)).toBe(false);
      expect(can(user(['Administrator']), PERMISSIONS.USERS_CREATE)).toBe(true);
      expect(can(user(['Employee']), PERMISSIONS.USERS_CREATE)).toBe(false);
    });
  });

  describe('canAccessTicket() · nivel registro', () => {
    const ticket = { createdBy: 10, assignedTechnicianId: 20 };

    it('Employee ve solo sus propios tickets', () => {
      expect(canAccessTicket(ticket, user(['Employee'], 10))).toBe(true);
      expect(canAccessTicket(ticket, user(['Employee'], 99))).toBe(false);
    });

    it('Technician ve asignados y propios', () => {
      expect(canAccessTicket(ticket, user(['Technician'], 20))).toBe(true); // asignado
      expect(canAccessTicket(ticket, user(['Technician'], 10))).toBe(true); // creador
      expect(canAccessTicket(ticket, user(['Technician'], 99))).toBe(false);
    });

    it('Advisor y Manager ven todos', () => {
      expect(canAccessTicket(ticket, user(['Service Advisor'], 99))).toBe(true);
      expect(canAccessTicket(ticket, user(['Manager'], 99))).toBe(true);
    });

    it('Administrator NO ve tickets ajenos (separación de deberes)', () => {
      expect(canAccessTicket(ticket, user(['Administrator'], 99))).toBe(false);
      expect(canAccessTicket(ticket, user(['Administrator'], 10))).toBe(true); // solo si es suyo
    });
  });

  describe('denegación por defecto', () => {
    it('un permiso no listado en ningún rol es denegado para todos', () => {
      // Solo como ejemplo: no hay rol que publique conocimiento salvo Manager.
      const all = ['Employee', 'Technician', 'Service Advisor', 'Administrator'] as Role[];
      for (const role of all) {
        expect(can(user([role]), PERMISSIONS.KNOWLEDGE_PUBLISH)).toBe(false);
      }
      expect(can(user(['Manager']), PERMISSIONS.KNOWLEDGE_PUBLISH)).toBe(true);
    });
  });
});