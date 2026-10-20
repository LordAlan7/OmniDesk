describe('FR-003 - Creación de Tickets de Soporte', () => {
  const uniqueTitle = `Ticket de Prueba ${Date.now()}`;

  beforeEach(() => {
    // Iniciamos sesión como empleado
    cy.visit('/login');
    cy.get('#email').type('employee@company.com');
    cy.get('#password').type('ChangeMe123!', { log: false });
    cy.get('button[type="submit"]').click();
    cy.location('pathname').should('not.eq', '/login');
  });

  it('llena el formulario, crea el ticket y muestra la confirmación', () => {
    // Navegamos a la creación de tickets
    cy.visit('/tickets/new');

    // Intentamos enviar vacío para probar validación
    cy.get('button[type="submit"]').click();
    cy.contains('La descripción es obligatoria.').should('be.visible');

    // Llenamos los campos
    cy.get('#title').type(uniqueTitle);
    cy.get('#description').type('No puedo acceder al sistema de reportes, me da error 500.');
    cy.get('#categoryId').select(1); // Seleccionamos la primera categoría
    cy.get('#storeLocation').type('Sucursal Norte');
    cy.get('#motorcycleModel').type('Italika Vortox');

    // Interceptamos la llamada a la API para esperar la respuesta
    cy.intercept('POST', '**/api/v1/tickets').as('createTicket');
    cy.get('button[type="submit"]').click();

    // Verificamos que se haya llamado a la API
    cy.wait('@createTicket').its('response.statusCode').should('eq', 201);

    // Verificamos la pantalla de éxito
    cy.contains('¡Ticket creado con éxito!').should('be.visible');
    cy.contains('#TK-').should('be.visible');
  });

  it('verifica que el ticket aparezca en el listado general', () => {
    cy.visit('/tickets');
    cy.contains(uniqueTitle).should('be.visible');
  });
});