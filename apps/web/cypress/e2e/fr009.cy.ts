/**
 * FR-009 — Investigación, resolución y cierre de tickets.
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
  cy.get('#description').type('Descripción para pruebas de FR-009.')
  cy.get('#categoryId').select(1)
  cy.get('#storeLocation').type('Sucursal Centro')
  cy.get('#motorcycleModel').type('Italika FT150')
  cy.get('button[type="submit"]').click()
  cy.contains('¡Ticket creado con éxito!').should('be.visible')
  // Extraer el ID del ticket
  cy.contains('#TK-').invoke('text').then((text: string) => {
    const id = text.match(/\d+/)?.[0]
    cy.wrap(id).as('ticketId')
  })
}

function assignToTechnician(ticketId: string) {
  cy.visit('/tickets')
  // Cerrar sesión y entrar como asesor para asignar
  cy.get('[data-testid="nav-logout"]').click()
  loginViaUi('advisor@company.com')
  cy.visit(`/tickets/${ticketId}`)
  cy.contains('button', 'Asignar técnico').click()
  cy.get('#technician').select('Demo Technician')
  cy.contains('button', 'Confirmar asignación').click()
  cy.contains('Asignación guardada correctamente').should('be.visible')
}

function startProgress(ticketId: string) {
  // Cerrar sesión y entrar como técnico para pasar a In Progress
  cy.get('[data-testid="nav-logout"]').click()
  loginViaUi('technician@company.com')
  cy.visit(`/tickets/${ticketId}`)
  // Pasar a In Progress usando el dropdown de transiciones
  cy.get('#tracking-transition').select('En progreso')
  cy.contains('button', 'Aplicar cambio').click()
  cy.contains('Estado actual: En proceso', { timeout: 10000 }).should('be.visible')
}

describe('FR-009 — Investigación, resolución y cierre', () => {
  beforeEach(() => cy.clearAllSessionStorage())

  it('técnico registra investigación, resuelve y cierra el ticket', () => {
    const title = `Ticket FR-009 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    // Asignar y pasar a In Progress
    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      startProgress(id)
    })

    // Registrar una investigación
    cy.get('#inv-activity').type('Revisé los logs del sistema y encontré errores de conexión.')
    cy.get('#inv-result').type('Identifiqué que el servicio de base de datos no respondía.')
    cy.contains('button', 'Registrar investigación').click()
    cy.contains('Investigación registrada').should('be.visible')
    cy.contains('Revisé los logs del sistema').should('be.visible')

    // Resolver el ticket con todos los campos
    cy.get('#tracking-transition').select('Resuelto')
    cy.get('#resolution').type('Reinicié el servicio de base de datos y restauré la conexión.')
    cy.get('#resolution-verification').type('Confirmé que el usuario puede acceder al sistema.')
    cy.get('#root-cause').type('El servicio de base de datos se detuvo por falta de memoria.')
    cy.get('#observations').type('Se recomienda monitoreo proactivo del servicio.')
    cy.contains('button', 'Aplicar cambio').click()
    cy.contains('Estado actual: Resuelto', { timeout: 10000 }).should('be.visible')

    // Cerrar el ticket (el técnico que resolvió puede cerrar — decisión 1)
    cy.contains('h2', 'Cierre formal').should('be.visible')
    cy.contains('Solución aplicada').should('be.visible')
    cy.contains('Reinicié el servicio de base de datos').should('be.visible')
    cy.contains('Comprobación del resultado').should('be.visible')
    cy.contains('Confirmé que el usuario puede acceder').should('be.visible')
    cy.get('#close-comment').type('Cerrado tras verificación del usuario.')
    cy.contains('button', 'Cerrar ticket').click()
    cy.contains('Estado actual: Cerrado', { timeout: 10000 }).should('be.visible')
  })

  it('el solicitante no ve la resolución ni las investigaciones (decisión 7)', () => {
    // Crear, asignar, resolver y cerrar un ticket como técnico
    const title = `Ticket visibilidad FR-009 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      startProgress(id)

      // Resolver como técnico
      cy.get('#tracking-transition').select('Resuelto')
      cy.get('#resolution').type('Resolución confidencial del técnico.')
      cy.get('#resolution-verification').type('Verificación confidencial.')
      cy.contains('button', 'Aplicar cambio').click()
      cy.contains('Estado actual: Resuelto', { timeout: 10000 }).should('be.visible')

      // Cerrar sesión y entrar como empleado (solicitante)
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('employee@company.com')

      // El solicitante ve el estado Resuelto pero no el contenido de la resolución
      cy.visit(`/my-tickets/${id}`)
      cy.contains('Resuelto').should('be.visible')
      cy.contains('Resolución confidencial del técnico').should('not.exist')
      cy.contains('Verificación confidencial').should('not.exist')

      // El solicitante no ve la sección de investigaciones
      cy.contains('h2', 'Investigación').should('not.exist')
    })
  })

  it('reapertura requiere motivo y conserva la resolución previa', () => {
    const title = `Ticket reapertura FR-009 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      startProgress(id)

      // Resolver
      cy.get('#tracking-transition').select('Resuelto')
      cy.get('#resolution').type('Solución inicial.')
      cy.get('#resolution-verification').type('Verificación inicial.')
      cy.contains('button', 'Aplicar cambio').click()
      cy.contains('Estado actual: Resuelto', { timeout: 10000 }).should('be.visible')

      // Intentar reabrir sin motivo (debe mostrar error)
      cy.get('#reopen-reason').type('   ')
      cy.contains('button', 'Reabrir ticket').click()
      cy.contains('El motivo de reapertura es obligatorio').should('be.visible')

      // Reabrir con motivo
      cy.get('#reopen-reason').clear().type('El usuario reportó el mismo problema de nuevo.')
      cy.contains('button', 'Reabrir ticket').click()
      cy.contains('Estado actual: En progreso', { timeout: 10000 }).should('be.visible')

      // La resolución previa se conserva en el ticket (visible para el técnico)
      cy.visit(`/tickets/${id}`)
      cy.contains('Solución inicial').should('exist')
    })
  })

  it('rechaza resolución sin comprobación del resultado', () => {
    const title = `Ticket validación FR-009 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      startProgress(id)

      // Intentar resolver sin comprobación
      cy.get('#tracking-transition').select('Resuelto')
      cy.get('#resolution').type('Solo la solución, sin comprobación.')
      cy.contains('button', 'Aplicar cambio').click()
      cy.contains('Escribe la comprobación del resultado').should('be.visible')
      cy.contains('Estado actual: Resuelto').should('not.exist')
    })
  })

  it('no se pueden registrar investigaciones en un ticket cerrado', () => {
    const title = `Ticket cerrado FR-009 ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      startProgress(id)

      // Resolver
      cy.get('#tracking-transition').select('Resuelto')
      cy.get('#resolution').type('Solución.')
      cy.get('#resolution-verification').type('Verificación.')
      cy.contains('button', 'Aplicar cambio').click()
      cy.contains('Estado actual: Resuelto', { timeout: 10000 }).should('be.visible')

      // Cerrar
      cy.contains('button', 'Cerrar ticket').click()
      cy.contains('Estado actual: Cerrado', { timeout: 10000 }).should('be.visible')

      // El formulario de investigación no debe aparecer
      cy.get('#inv-activity').should('not.exist')
    })
  })
})