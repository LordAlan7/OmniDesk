
/**
 * NFR-011 — Compatibilidad con navegadores de escritorio.
 * Dashboard principal y Panel de soporte.
 *
 * Ejecutar con Chrome y Microsoft Edge.
 * Requiere API :3000 y frontend :5173.
 */

const PASSWORD = 'ChangeMe123!'

// Iniciar sesión con las cuentas semilla de pruebas.
function loginAs(email: string) {
  cy.intercept('POST', '**/api/v1/auth/login')
    .as('loginDashboard')

  cy.visit('/login')

  cy.get('[data-testid=login-email]')
    .type(email)

  cy.get('[data-testid=login-password]')
    .type(PASSWORD, { log: false })

  cy.get('[data-testid=login-submit]')
    .click()

  cy.wait('@loginDashboard')
    .its('response.statusCode')
    .should('eq', 200)

  // Entrar explícitamente al Dashboard principal.
  cy.visit('/')

  cy.get('[data-testid=dashboard-title]')
    .should('be.visible')
}

// Detectar desbordamiento horizontal de la página.
function checkHorizontalOverflow() {
  cy.document().then((doc) => {
    const html = doc.documentElement

    expect(
      html.scrollWidth,
      'ancho horizontal del documento',
    ).to.be.at.most(html.clientWidth + 2)
  })
}

describe('NFR-011 - Dashboards de escritorio', () => {

  beforeEach(() => {
    cy.viewport(1366, 768)
  })

  it('empleado ve sus accesos y no puede entrar al Panel de soporte', () => {
    loginAs('employee@company.com')

    cy.get('[data-testid=dashboard-roles]')
      .should('contain', 'Employee')

    cy.contains('a.opcion-card', 'Crear ticket')
      .should('be.visible')

    cy.contains('a.opcion-card', 'Mis tickets')
      .should('be.visible')

    cy.contains('a.opcion-card', 'Biblioteca de documentos')
      .should('be.visible')

    // El empleado no debe ver el panel de métricas.
    cy.contains('a.opcion-card', 'Panel de soporte')
      .should('not.exist')

    // Tampoco debe acceder escribiendo la URL.
    cy.visit('/support-dashboard')

    cy.location('pathname')
      .should('eq', '/forbidden')

    cy.get('[data-testid=forbidden-title]')
      .should('be.visible')
  })

  it('administrador puede acceder a Gestión de usuarios', () => {
    loginAs('admin@company.com')

    cy.get('[data-testid=dashboard-roles]')
      .should('contain', 'Administrator')

    cy.contains('a.opcion-card', 'Gestión de usuarios')
      .should('be.visible')
      .click()

    cy.location('pathname')
      .should('eq', '/users')

    cy.contains('h1', 'Usuarios y técnicos')
      .should('be.visible')
  })

  it('Manager consulta el Panel de soporte en resoluciones de escritorio', () => {
    loginAs('manager@company.com')

    cy.get('[data-testid=dashboard-roles]')
      .should('contain', 'Manager')

    cy.contains('a.opcion-card', 'Panel de soporte')
      .should('be.visible')
      .click()

    cy.location('pathname')
      .should('eq', '/support-dashboard')

    cy.contains('h1', 'Panel de soporte')
      .should('be.visible')

    // Comprobar que los indicadores cargan.
    cy.get('.metrics-grid .metric-card')
      .should('have.length', 8)

    cy.contains('.metric-card', 'Total de tickets')
      .should('be.visible')

    cy.contains('h2', 'Tickets por estado')
      .should('be.visible')

    cy.contains('h2', 'Tickets por prioridad')
      .should('be.visible')

    cy.contains('h2', 'Carga de trabajo por técnico')
      .should('be.visible')

    cy.contains('h2', 'Consultar tickets')
      .should('be.visible')

    cy.contains('h2', 'Actividad de tickets por periodo')
      .should('be.visible')

    // Verificar resoluciones de escritorio.
    const resolutions = [
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ]

    resolutions.forEach(({ width, height }) => {
      cy.viewport(width, height)

      cy.get('main.support-dashboard')
        .should('be.visible')

      checkHorizontalOverflow()
    })
  })

})
