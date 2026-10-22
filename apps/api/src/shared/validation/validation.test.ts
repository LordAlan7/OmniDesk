import {
  STRING_LIMITS,
  MESSAGES,
  CONDITIONAL_RULES,
  UNIQUENESS_RULES,
} from './validationRules';

describe('NFR-010 · diccionario de validación', () => {
  describe('límites de longitud', () => {
    it('cada límite tiene min < max y ambos positivos', () => {
      for (const [name, limits] of Object.entries(STRING_LIMITS)) {
        expect({ name, min: limits.min, max: limits.max }).toEqual({
          name,
          min: limits.min,
          max: limits.max,
        });
        expect(limits.min).toBeGreaterThanOrEqual(0);
        expect(limits.max).toBeGreaterThan(limits.min);
      }
    });

    it('el título del ticket tiene un mínimo razonable', () => {
      expect(STRING_LIMITS.ticketTitle.min).toBeGreaterThanOrEqual(3);
    });

    it('la contraseña exige al menos 10 caracteres', () => {
      expect(STRING_LIMITS.userPassword.min).toBeGreaterThanOrEqual(10);
    });
  });

  describe('mensajes de error', () => {
    it('construye mensajes de longitud con parámetros', () => {
      expect(MESSAGES.tooShort('El título', 3)).toBe(
        'El título debe tener al menos 3 caracteres.',
      );
      expect(MESSAGES.tooLong('La descripción', 5000)).toBe(
        'La descripción no puede exceder 5000 caracteres.',
      );
    });

    it('los mensajes de enum listan las opciones', () => {
      const msg = MESSAGES.invalidEnum('status', ['Open', 'Closed']);
      expect(msg).toContain('Open');
      expect(msg).toContain('Closed');
    });
  });

  describe('reglas documentadas', () => {
    it('hay al menos una regla de unicidad documentada', () => {
      expect(Object.keys(UNIQUENESS_RULES).length).toBeGreaterThan(0);
      expect(UNIQUENESS_RULES.userEmail.description).toContain('único');
    });

    it('las 5 reglas condicionales esperadas están documentadas', () => {
      const rules = CONDITIONAL_RULES.map((r) => r.rule);
      expect(rules.some((r) => r.includes('Resolved'))).toBe(true);
      expect(rules.some((r) => r.includes('Closed'))).toBe(true);
      expect(rules.some((r) => r.includes('Assigned'))).toBe(true);
      expect(rules.some((r) => r.includes('Open'))).toBe(true);
      expect(rules.some((r) => r.includes('técnico con tickets'))).toBe(true);
    });
  });
});