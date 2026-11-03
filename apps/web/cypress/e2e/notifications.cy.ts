/**
 * FR-020 — Notificaciones internas de tickets.
 *
 * Requiere: API corriendo en :3000 (cuentas semilla) y el frontend en :5173.
 *   npm run dev:api   |   npm run dev:web   |   npm run test:e2e --prefix apps/web
 */
const PASSWORD = 'ChangeMe123!'

function loginViaUi(email: string, password = PASSWORD) {
  cy.visit('/login')
  cy.get('#email').type(email)
  cy.get('#password').type(password, { log: false })
  cy.get('button[type="submit"]').click()
  cy.location('pathname').should('not.eq', '/login')
}

function createTicketAsEmployee(title: string) {
  cy.visit('/tickets/new')
  cy.get('#title').type(title)
  cy.get('#description').type('Descripción para FR-020.')
  cy.get('#categoryId').select(1)
  cy.get('#storeLocation').type('Sucursal Centro')
  cy.get('#motorcycleModel').type('Italika FT150')
  cy.get('button[type="submit"]').click()
  cy.contains('¡Ticket creado con éxito!').should('be.visible')
  cy.contains('#TK-').invoke('text').then((text: string) => {
    cy.wrap(text.match(/\d+/)?.[0]).as('ticketId')
  })
}

describe('FR-020 — Notificaciones', () => {
  beforeEach(() => cy.clearAllSessionStorage())

  it('el solicitante recibe una notificación cuando le asignan su ticket', () => {
    const title = `Ticket FR-020 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    // Cerrar sesión y entrar como asesor para asignar
    cy.get('[data-testid="nav-logout"]').click()
    loginViaUi('advisor@company.com')

    cy.get<string>('@ticketId').then((id) => {
      cy.visit(`/tickets/${id}`)
      cy.contains('button', 'Asignar técnico').click()
      cy.get('#technician').select('Demo Technician')
      cy.contains('button', 'Confirmar asignación').click()
      cy.contains('Asignación guardada correctamente').should('be.visible')
    })

    // Cerrar sesión y entrar como empleado de nuevo: debe ver el badge
    cy.get('[data-testid="nav-logout"]').click()
    loginViaUi('employee@company.com')

    // El badge del indicador debe mostrar al menos 1 no leída
    cy.get('[data-testid="notifications-badge"]').should('be.visible')
    cy.get('[data-testid="notifications-badge"]').invoke('text').then((text) => {
      const count = parseInt(text, 10)
      expect(count).to.be.greaterThan(0)
    })

    // Abrir la vista de notificaciones
    cy.get('[data-testid="nav-notifications"]').click()
    cy.location('pathname').should('eq', '/notifications')
    cy.contains('Se asignó un técnico a tu ticket').should('be.visible')
  })

  it('abrir una notificación la marca como leída (decisión 4)', () => {
    const title = `Ticket mark-read FR-020 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      // Como asesor: asignar
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('advisor@company.com')
      cy.visit(`/tickets/${id}`)
      cy.contains('button', 'Asignar técnico').click()
      cy.get('#technician').select('Demo Technician')
      cy.contains('button', 'Confirmar asignación').click()
      cy.contains('Asignación guardada correctamente').should('be.visible')

      // Como empleado: abrir notificación
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('employee@company.com')
      cy.get('[data-testid="nav-notifications"]').click()

      cy.get('.notification-item.unread').should('exist')
      cy.get('.notification-item.unread').first().find('.notification-button').click()

      // La notificación debe dejar de tener la clase unread
      cy.get('.notification-item.unread').should('not.exist')

      // Volvemos a la vista de notificaciones y el badge bajó
      cy.visit('/notifications')
      cy.get('[data-testid="notifications-badge"]').should('not.exist')
    })
  })

  it('marcar todas como leídas limpia el badge', () => {
    const title = `Ticket mark-all FR-020 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      // Como asesor: asignar (genera 1 notificación)
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('advisor@company.com')
      cy.visit(`/tickets/${id}`)
      cy.contains('button', 'Asignar técnico').click()
      cy.get('#technician').select('Demo Technician')
      cy.contains('button', 'Confirmar asignación').click()
      cy.contains('Asignación guardada correctamente').should('be.visible')

      // Como empleado: ir a notificaciones y marcar todas
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('employee@company.com')
      cy.get('[data-testid="nav-notifications"]').click()
      cy.contains('button', 'Marcar todas como leídas').click()
      cy.contains('notificaciones como leídas').should('be.visible')

      // El badge desapareció
      cy.get('[data-testid="notifications-badge"]').should('not.exist')
    })
  })

  it('el actor que ejecuta la acción no recibe notificación (decisión 1)', () => {
    const title = `Ticket no-actor FR-020 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      // Como asesor: asignar
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('advisor@company.com')
      cy.visit(`/tickets/${id}`)
      cy.contains('button', 'Asignar técnico').click()
      cy.get('#technician').select('Demo Technician')
      cy.contains('button', 'Confirmar asignación').click()
      cy.contains('Asignación guardada correctamente').should('be.visible')

      // El asesor NO debe tener notificación de su propia acción
      cy.get('[data-testid="nav-notifications"]').click()
      cy.contains('Se asignó un técnico a tu ticket').should('not.exist')
    })
  })

  it('el contador se actualiza con polling (simulado por foco de ventana)', () => {
    const title = `Ticket polling FR-020 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('advisor@company.com')
      cy.visit(`/tickets/${id}`)
      cy.contains('button', 'Asignar técnico').click()
      cy.get('#technician').select('Demo Technician')
      cy.contains('button', 'Confirmar asignación').click()
      cy.contains('Asignación guardada correctamente').should('be.visible')

      // Empleado entra: el contador arranca en 0
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('employee@company.com')

      // Disparar foco de ventana (simula el polling)
      cy.window().then((win) => {
        win.dispatchEvent(new win.Event('focus'))
      })

      // El badge debe aparecer
      cy.get('[data-testid="notifications-badge"]').should('be.visible')
    })
  })
})