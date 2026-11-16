describe('FR-006 - Gestión de prioridad de tickets', () => {
  beforeEach(() => {
    cy.visit('/login');
    cy.get('#email').type('employee@company.com');
    cy.get('#password').type('ChangeMe123!', { log: false });
    cy.get('button[type="submit"]').click();
    cy.location('pathname').should('not.eq', '/login');
  });

  it('gerente asigna y modifica la prioridad de un ticket', () => {
    // Crear un ticket como empleado
    cy.visit('/tickets/new');
    cy.get('#title').type('Ticket para probar prioridad');
    cy.get('#description').type('Necesito que se revise este problema.');
    cy.get('#categoryId').select(1);
    cy.get('#storeLocation').type('Sucursal Norte');
    cy.get('#motorcycleModel').type('Italika RT200');
    cy.get('button[type="submit"]').click();

    // Extraer el ID del ticket de la pantalla de éxito usando invoke('text')
    cy.contains('#TK-').invoke('text').then((text: string) => {
      const ticketNumber = text.match(/\d+/)?.[0];
      expect(ticketNumber, 'El número de ticket debería existir').to.be.a('string');

      // Cerrar sesión y entrar como gerente
      cy.get('[data-testid="nav-logout"]').click();

      cy.get('#email').type('manager@company.com');
      cy.get('#password').type('ChangeMe123!', { log: false });
      cy.get('button[type="submit"]').click();

      // Ir al detalle del ticket
      cy.visit(`/tickets/${ticketNumber}`);

      // Verificar que la sección de prioridad existe
      cy.contains('h2', 'Prioridad').should('be.visible');
      cy.contains('Pendiente de priorización').should('be.visible');

      // Abrir el editor de prioridad
      cy.contains('button', 'Asignar prioridad').click();

      // Seleccionar una prioridad
      cy.get('#priority').select('3');

      // Escribir un motivo
      cy.get('#priority-reason').type('Problema reportado por tienda principal');

      // Guardar
      cy.intercept('PATCH', '**/api/v1/tickets/*/priority').as('savePriority');
      cy.contains('button', 'Confirmar prioridad').click();

      cy.wait('@savePriority').its('response.statusCode').should('eq', 200);

      // Verificar que la prioridad se actualizó
      cy.contains('Prioridad actualizada correctamente').should('be.visible');
      cy.contains('High - Alta').should('be.visible');

      // Verificar que el historial muestra el cambio
      cy.contains('Prioridad: Sin prioridad → High').should('be.visible');
    });
  });
});