/**
 * Paso 11 — Refacciones y existencias: búsqueda.
 * Requiere API :3000 y frontend :5173 (INVENTORY_PROVIDER=mock para datos semilla).
 */
describe('Paso 11 - Refacciones y existencias', () => {
  const PASSWORD = 'ChangeMe123!'

  function loginAs(email: string) {
    cy.visit('/login')
    cy.get('#email').type(email)
    cy.get('#password').type(PASSWORD, { log: false })
    cy.get('button[type="submit"]').click()
    cy.location('pathname').should('not.eq', '/login')
  }

  beforeEach(() => cy.viewport(1366, 768))

  it('busca por nombre, expande existencias por ubicación y copia el SKU', () => {
    loginAs('technician@company.com')

    cy.get('[data-testid=nav-parts]').should('be.visible').click()
    cy.location('pathname').should('eq', '/inventory/parts')

    // Catálogo inicial cargado
    cy.get('[data-testid=parts-table]').should('be.visible')

    // Búsqueda por nombre
    cy.intercept('GET', '**/api/v1/inventory/products*').as('search')
    cy.get('#parts-search').type('filtro de aceite')
    cy.get('form.search-bar button[type=submit]').click()
    cy.wait('@search')

    cy.get('[data-testid=parts-table]').contains('Filtro de aceite').should('be.visible')
    cy.get('[data-testid=parts-table]').contains('FIL-ACE-150').should('be.visible')

    // No existe ninguna columna de precio (contrato §4)
    cy.get('[data-testid=parts-table] th').should('not.contain', 'Precio')

    // Existencias por ubicación con indicadores
    cy.intercept('GET', '**/api/v1/inventory/products/*/stock').as('stock')
    cy.get('.btn-link').first().click()
    cy.wait('@stock')

    cy.get('[data-testid=stock-locations]').should('be.visible')
    cy.get('[data-testid=stock-locations]').contains('Almacén Principal').should('be.visible')
    cy.get('[data-testid=stock-locations]').contains('Disponible').should('be.visible')

    // Copiar SKU (clipboard del navegador real)
    cy.get('[data-testid=copy-sku-FIL-ACE-150]').click()
    cy.get('[data-testid=copy-sku-FIL-ACE-150]').contains('¡Copiado!').should('be.visible')
  })

  it('busca por código/SKU desde el catálogo', () => {
    loginAs('technician@company.com')
    cy.visit('/inventory/parts')

    cy.get('#parts-search').type('BAT-12V-9A')
    cy.get('form.search-bar button[type=submit]').click()

    cy.get('[data-testid=parts-table]').contains('Batería 12V 9Ah').should('be.visible')
  })

  it('con VIN muestra las compatibles de la moto y el estado vacío al no encontrar', () => {
    loginAs('technician@company.com')
    cy.visit('/inventory/parts')

    // VIN semilla del mock → compatibles del Modelo 150
    cy.get('#parts-vin').type('MD2A1AAX5RWA00004')
    cy.get('form.vin-bar button[type=submit]').click()

    cy.get('[data-testid=parts-vehicle-context]').contains('Modelo 150').should('be.visible')
    cy.get('[data-testid=parts-table]').should('be.visible')

    // Búsqueda local sin resultados dentro de las compatibles
    cy.get('#parts-search').type('xyz123')
    cy.get('form.search-bar button[type=submit]').click()
    cy.get('[data-testid=parts-empty]').should('be.visible')
  })

  it('employee no ve la entrada ni la ruta (guarda inventory:read)', () => {
    loginAs('employee@company.com')

    cy.get('[data-testid=nav-parts]').should('not.exist')
    cy.visit('/inventory/parts')
    cy.location('pathname').should('eq', '/forbidden')
  })
})