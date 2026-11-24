/**
 * Paso 10 — Consulta de motocicleta por VIN (FR-010, contrato v1.0).
 *
 * Requiere API :3000 y frontend :5173, como los demás specs.
 * Para el flujo feliz: backend con INVENTORY_PROVIDER=mock
 * (VIN semilla MD2A1AAX5RWA00004). Los casos de error van
 * interceptados, así que no dependen del proveedor.
 */
describe('Paso 10 - Consulta de motocicleta por VIN', () => {
  const VIN = 'MD2A1AAX5RWA00004'
  const PASSWORD = 'ChangeMe123!'

  function loginAs(email: string) {
    cy.visit('/login')
    cy.get('#email').type(email)
    cy.get('#password').type(PASSWORD, { log: false })
    cy.get('button[type="submit"]').click()
    cy.location('pathname').should('not.eq', '/login')
  }

  beforeEach(() => {
    cy.viewport(1366, 768)
  })

  it('menú, ficha, garantía vigente y eventos (VIN en minúsculas → normalizado)', () => {
    loginAs('technician@company.com')

    // Entrada del menú (solo roles con inventory:read)
    cy.get('[data-testid=nav-inventory]').should('be.visible').click()
    cy.location('pathname').should('eq', '/inventory/vehicle')

    // §10: se normaliza a mayúsculas antes de buscar
    cy.get('#vin').type(VIN.toLowerCase())
    cy.get('button[type="submit"]').click()

    // Ficha: marca, modelo, año, estado
    cy.get('[data-testid=vehicle-card]').should('be.visible')
    cy.get('[data-testid=vehicle-card]').contains('Marca Demo').should('be.visible')
    cy.get('[data-testid=vehicle-card]').contains('Modelo 150').should('be.visible')
    cy.get('[data-testid=vehicle-card]').contains('2023').should('be.visible')
    cy.get('[data-testid=vehicle-card]').contains('Vendida').should('be.visible')
    cy.get('[data-testid=vehicle-card]').contains(VIN).should('be.visible')

    // Garantía vigente (mock: ACTIVE, 12 meses)
    cy.get('[data-testid=warranty-section]').should('be.visible')
    cy.get('[data-testid=warranty-section]').contains('Vigente').should('be.visible')
    cy.get('[data-testid=warranty-section]').contains('12 meses').should('be.visible')

    // Últimos eventos: venta e ingreso (mock: SALE + ENTRY)
    cy.get('[data-testid=events-section]').should('be.visible')
    cy.get('[data-testid=events-section]').contains('Venta').should('be.visible')
    cy.get('[data-testid=events-section]').contains('Ingreso a inventario').should('be.visible')
  })

  it('crea un ticket desde la ficha con el VIN prellenado', () => {
    loginAs('technician@company.com')
    cy.visit('/inventory/vehicle')

    cy.get('#vin').type(VIN)
    cy.get('button[type="submit"]').click()
    cy.get('[data-testid=vehicle-card]').should('be.visible')

    cy.intercept('POST', '**/api/v1/tickets').as('createTicket')
    cy.get('[data-testid=create-ticket-from-vehicle]').click()

    // Llegó al formulario con los query params de la moto
    cy.location('pathname').should('eq', '/tickets/new')

    // Chip del VIN + modelo prellenado (Marca Modelo Año)
    cy.get('[data-testid=prefilled-vin]').should('be.visible')
    cy.get('[data-testid=prefilled-vin]').contains(VIN).should('be.visible')
    cy.get('#motorcycleModel').should('have.value', 'Marca Demo Modelo 150 2023')

    // Completa el resto y envía
    cy.get('#title').type(`Ticket con moto ${Date.now()}`)
    cy.get('#description').type(
      'La motocicleta presenta una falla eléctrica detectada al consultar la ficha de inventario.',
    )
    cy.get('#categoryId').select(1)
    cy.get('#storeLocation').type('Sucursal Norte')

    cy.get('button[type="submit"]').click()

    cy.wait('@createTicket').then((interception) => {
      // 201 y el payload viaja con el VIN de la moto consultada
      expect(interception.response?.statusCode).to.eq(201)
      expect(interception.request.body.vehicleVin).to.eq(VIN)
    })

    cy.contains('¡Ticket creado con éxito!').should('be.visible')
    cy.contains('#TK-').should('be.visible')
  })

  it('mensaje claro cuando el VIN no existe (404 INVENTORY_NOT_FOUND)', () => {
    loginAs('technician@company.com')
    cy.visit('/inventory/vehicle')

    cy.intercept('GET', '**/api/v1/inventory/vehicles/by-vin/*', {
      statusCode: 404,
      body: {
        error: {
          code: 'INVENTORY_NOT_FOUND',
          message: 'La motocicleta no existe en inventario.',
        },
      },
    }).as('missingVin')

    cy.get('#vin').type('ZZZ111ZZZ2ZZ00001')
    cy.get('button[type="submit"]').click()

    cy.get('[data-testid=inventory-error]')
      .should('be.visible')
      .and('contain', 'No existe una motocicleta con el VIN')
  })

  it('mensaje claro cuando el inventario no responde (503 INVENTORY_UNAVAILABLE)', () => {
    loginAs('technician@company.com')
    cy.visit('/inventory/vehicle')

    cy.intercept('GET', '**/api/v1/inventory/vehicles/by-vin/*', {
      statusCode: 503,
      body: {
        error: {
          code: 'INVENTORY_UNAVAILABLE',
          message: 'El servicio de inventario no está disponible.',
        },
      },
    }).as('inventoryDown')

    cy.get('#vin').type(VIN)
    cy.get('button[type="submit"]').click()

    cy.get('[data-testid=inventory-error]')
      .should('be.visible')
      .and('contain', 'El inventario no responde')
  })

  it('employee no ve la entrada y la URL lo manda a /forbidden (guarda inventory:read)', () => {
    loginAs('employee@company.com')

    cy.get('[data-testid=nav-inventory]').should('not.exist')

    cy.visit('/inventory/vehicle')
    cy.location('pathname').should('eq', '/forbidden')
  })
})
