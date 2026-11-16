/**
 * AIR-004 — Revisión humana de recomendaciones de IA.
 *
 * Requiere: API corriendo en :3000 (cuentas semilla, AI_PROVIDER=mock) y el
 * frontend en :5173.
 *   npm run dev:api   |   npm run dev:web   |   npm run test:e2e --prefix apps/web
 *
 * Escenarios:
 *  1. El técnico aprueba una recomendación y ve la confirmación.
 *  2. El técnico NO puede rechazar (sólo Manager) — botón no visible.
 *  3. "Solicitar más información" dispara una nueva consulta y la añade a los turnos.
 *  4. Aplicar la recomendación aprobada a una investigación la registra en el ticket.
 *  5. No se puede aplicar sin haber aprobado (la API devuelve 409).
 *  6. La decisión se puede cambiar (D3): Manager aprueba y luego rechaza, el estado cambia.
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
  cy.get('#description').type('Descripción para AIR-004.')
  cy.get('#categoryId').select(1)
  cy.get('#storeLocation').type('Sucursal Centro')
  cy.get('#motorcycleModel').type('Italika FT150')
  cy.get('button[type="submit"]').click()
  cy.contains('¡Ticket creado con éxito!').should('be.visible')
  cy.contains('#TK-').invoke('text').then((text: string) => {
    cy.wrap(text.match(/\d+/)?.[0]).as('ticketId')
  })
}

function assignToTechnician(id: string) {
  cy.get('[data-testid="nav-logout"]').click()
  loginViaUi('advisor@company.com')
  cy.visit(`/tickets/${id}`)
  cy.contains('button', 'Asignar técnico').click()
  cy.get('#technician').select('Demo Technician')
  cy.contains('button', 'Confirmar asignación').click()
  cy.contains('Asignación guardada correctamente').should('be.visible')
}

function startWork() {
  cy.contains('button', 'Iniciar trabajo').click()
  cy.contains('Atención del ticket').should('be.visible')
}

function askAssistant(question: string) {
  cy.get('#assistant-question').type(question)
  cy.contains('button', 'Preguntar').click()
  cy.get('.bubble.ai').should('exist')
}

describe('AIR-004 — Revisión humana de recomendaciones de IA', () => {
  beforeEach(() => cy.clearAllSessionStorage())

  it('el técnico aprueba una recomendación y ve la confirmación', () => {
    const title = `Ticket AIR-004 approve ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('technician@company.com')
      cy.visit(`/tickets/${id}`)
      startWork()

      askAssistant('¿Cómo se reinicia la impresora de caja?')

      // Aprobar pidiendo motivo (stub del prompt nativo)
      cy.window().then((win) => cy.stub(win, 'prompt').returns('La recomendación coincide con el manual aprobado.'))
      cy.contains('button', 'Aprobar recomendación').click()
      cy.contains('Recomendación aprobada').should('be.visible')
      cy.contains('Aplicar a investigación').should('be.visible')
      cy.contains('Aplicar a resolución').should('be.visible')
    })
  })

  it('el técnico no ve el botón de rechazar (sólo Manager)', () => {
    const title = `Ticket AIR-004 no-reject ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('technician@company.com')
      cy.visit(`/tickets/${id}`)
      startWork()

      askAssistant('¿Cómo se calibra el escáner?')
      cy.contains('button', 'Rechazar').should('not.exist')
    })
  })

  it('solicitar más información dispara una nueva consulta', () => {
    const title = `Ticket AIR-004 needs-info ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('technician@company.com')
      cy.visit(`/tickets/${id}`)
      startWork()

      askAssistant('¿Qué hago con la impresora?')

      cy.window().then((win) => cy.stub(win, 'prompt').returns('¿Es la impresora de caja o la de oficina?'))
      cy.contains('button', 'Solicitar más información').click()

      // Aparece un nuevo turno con la aclaración
      cy.contains('Aclaración sobre la recomendación').should('be.visible')
    })
  })

  it('aplicar la recomendación aprobada a una investigación la registra en el ticket', () => {
    const title = `Ticket AIR-004 apply-investigation ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('technician@company.com')
      cy.visit(`/tickets/${id}`)
      startWork()

      askAssistant('¿Cómo se reinicia la impresora de caja?')

      cy.window().then((win) => cy.stub(win, 'prompt').returns('Recomendación validada contra el manual.'))
      cy.contains('button', 'Aprobar recomendación').click()
      cy.contains('Recomendación aprobada').should('be.visible')

      cy.contains('button', 'Aplicar a investigación').click()
      cy.contains('h3', 'Aplicar a investigación').should('be.visible')
      // El contenido se pre-llena con la respuesta
      cy.get('#apply-activity').invoke('val').should('not.be.empty')
      cy.get('#apply-result').invoke('val').should('not.be.empty')

      cy.contains('button', 'Confirmar aplicación').click()

      // La investigación se guarda y aparece en la lista
      cy.contains('Actividad:').should('exist')
    })
  })

  it('no se puede aplicar sin haber aprobado (API 409)', () => {
    const title = `Ticket AIR-004 no-apply ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      cy.get('[data-testid="nav-logout"]').click()
      loginViaUi('technician@company.com')
      cy.visit(`/tickets/${id}`)
      startWork()

      askAssistant('¿Cómo se calibra el escáner?')

      // Sin aprobar, los botones de aplicar NO aparecen
      cy.contains('Aplicar a investigación').should('not.exist')
      cy.contains('Aplicar a resolución').should('not.exist')

      // Intento directo por API: debe responder 409 (invalidState)
      cy.request({
        url: `http://localhost:3000/api/v1/ai/interactions/1/apply`,
        method: 'POST',
        failOnStatusCode: false,
        body: { target: 'investigation', ticketId: Number(id), content: { activity: 'xxxxx', result: 'yyyyy' } },
      }).its('status').should('eq', 409)
    })
  })

  it('la decisión se puede cambiar (D3): Manager aprueba y luego rechaza', () => {
    const title = `Ticket AIR-004 change ${Date.now()}`
    loginViaUi('employee@company.com')
    createTicketAsEmployee(title)

    cy.get<string>('@ticketId').then((id) => {
      assignToTechnician(id)
      cy.get('[data-testid="nav-logout"]').click()
      // El Manager inicia sesión, pregunta y revisa él mismo (es el dueño).
      loginViaUi('manager@company.com')
      cy.visit(`/tickets/${id}`)

      askAssistant('¿Cómo se reinicia la impresora?')

      cy.window().then((win) => cy.stub(win, 'prompt').returns('Aprobado inicialmente.'))
      cy.contains('button', 'Aprobar recomendación').click()
      cy.contains('Recomendación aprobada').should('be.visible')

      // Ahora cambia de decisión: rechaza
      // Como Manager, ve el botón de rechazar.
      cy.window().then((win) => cy.stub(win, 'prompt').returns('Tras revisión adicional, no aplica.'))
      cy.contains('button', 'Rechazar').click()
      cy.contains('Recomendación rechazada').should('be.visible')
      cy.contains('Aplicar a investigación').should('not.exist')
    })
  })
})