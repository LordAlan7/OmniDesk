/**
 * AIR-001 — Asistente de IA para soporte técnico.
 *
 * Requiere: API corriendo en :3000 (cuentas semilla, AI_PROVIDER=mock) y el
 * frontend en :5173.
 *   npm run dev:api   |   npm run dev:web   |   npm run test:e2e --prefix apps/web
 *
 * Escenarios:
 *  1. El panel aparece en el detalle del ticket para usuarios con ai:query.
 *  2. Preguntar devuelve una respuesta del asistente (mock).
 *  3. La respuesta se marca como generada por IA (disclaimer visible).
 *  4. El ticketId se pasa automáticamente al abrir desde el detalle.
 *  5. La validación rechaza preguntas demasiado cortas (cliente).
 *  6. La ruta /ai/ask rechaza sin sesión (401).
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
  cy.get('#description').type('Descripción para AIR-001.')
  cy.get('#categoryId').select(1)
  cy.get('#storeLocation').type('Sucursal Centro')
  cy.get('#motorcycleModel').type('Italika FT150')
  cy.get('button[type="submit"]').click()
  cy.contains('¡Ticket creado con éxito!').should('be.visible')
  cy.contains('#TK-').invoke('text').then((text: string) => {
    cy.wrap(text.match(/\d+/)?.[0]).as('ticketId')
  })
}

describe('AIR-001 — Asistente de IA', () => {
  beforeEach(() => cy.clearAllSessionStorage())

  it('el panel aparece dentro del detalle del ticket para técnicos (ai:query)', () => {
    const title = `Ticket AIR-001 panel ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      // Como asesor: asignar al técnico para que luego él pueda ver el ticket.
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('advisor@company.com')
      cy.visit(`/tickets/${id}`)
      cy.contains('button', 'Asignar técnico').click()
      cy.get('#technician').select('Demo Technician')
      cy.contains('button', 'Confirmar asignación').click()
      cy.contains('Asignación guardada correctamente').should('be.visible')

      // Como técnico: el panel debe estar visible.
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('technician@company.com')
      cy.visit(`/tickets/${id}`)
      cy.contains('h2', 'Asistente de soporte').should('be.visible')
    })
  })

  it('preguntar devuelve una respuesta del asistente y la marca como IA', () => {
    const title = `Ticket AIR-001 ask ${Date.now()}`
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

      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('technician@company.com')
      cy.visit(`/tickets/${id}`)

      cy.get('#assistant-question').type('¿Cómo se reinicia la impresora de caja?')
      cy.contains('button', 'Preguntar').click()

      // Aparece un turno del asistente
      cy.get('.bubble.ai').should('exist')
      // El disclaimer debe ser visible (la respuesta se marca como IA)
      cy.contains('Respuesta generada por IA').should('be.visible')
    })
  })

  it('rechaza preguntas demasiado cortas en el cliente', () => {
    const title = `Ticket AIR-001 short ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('advisor@company.com')
      cy.visit(`/tickets/${id}`)
      cy.contains('button', 'Asignar técnico').click()
      cy.get('#technician').select('Demo Technician')
      cy.contains('button', 'Confirmar asignación').click()

      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('technician@company.com')
      cy.visit(`/tickets/${id}`)

      // Escribir "hola" (4 chars) — el botón debe seguir deshabilitado
      cy.get('#assistant-question').type('hola')
      cy.contains('button', 'Preguntar').should('be.disabled')
    })
  })

  it('la ruta /ai/ask rechaza sin sesión (401)', () => {
    // Sin token JWT → 401 antes de tocar el servicio. La matriz de permisos
    // (ai:query) se valida con sesión; aquí sólo verificamos el primer muro.
    cy.request({ url: 'http://localhost:3000/api/v1/ai/ask', method: 'POST', failOnStatusCode: false, body: { question: 'test' } })
      .its('status')
      .should('eq', 401)
  })

  it('envía el ticketId automáticamente cuando se abre desde el detalle', () => {
    const title = `Ticket AIR-001 ctx ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('advisor@company.com')
      cy.visit(`/tickets/${id}`)
      cy.contains('button', 'Asignar técnico').click()
      cy.get('#technician').select('Demo Technician')
      cy.contains('button', 'Confirmar asignación').click()

      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('technician@company.com')
      cy.visit(`/tickets/${id}`)

      cy.get('#assistant-question').type('¿Qué dice el manual sobre este ticket?')
      cy.contains('button', 'Preguntar').click()

      // El panel debe mostrar el contexto del ticket (decisión 4 del usuario).
      cy.contains(`Contexto usado: ticket #${id}`).should('be.visible')
    })
  })
})