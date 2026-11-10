/**
 * FR-013 — Asistente técnico de IA.
 * Las respuestas del asistente se interceptan: el e2e verifica la interfaz, no al proveedor.
 * Requiere API :3000 (con usuarios semilla) y frontend :5173.
 */

const PASSWORD = 'ChangeMe123!'

function loginAs(email: string) {
  cy.intercept('POST', '**/api/v1/auth/login').as('login')
  cy.visit('/login')
  cy.get('[data-testid=login-email]').type(email)
  cy.get('[data-testid=login-password]').type(PASSWORD, { log: false })
  cy.get('[data-testid=login-submit]').click()
  cy.wait('@login').its('response.statusCode').should('eq', 200)
}

describe('FR-013 asistente técnico', () => {
  beforeEach(() => loginAs('technician@company.com'))

  it('pregunta, muestra la etiqueta de IA y las fuentes con su versión', () => {
    cy.intercept('POST', '**/api/v1/ai/queries', {
      statusCode: 200,
      body: {
        data: {
          interactionId: 1,
          condition: 'recommendation',
          aiGenerated: true,
          requiresHumanReview: true,
          message: null,
          recommendation: 'Reinicia la impresora.',
          steps: ['Apaga la impresora', 'Enciéndela'],
          additionalInformation: [],
          references: [{ authorizationId: 1, sourceType: 'article', sourceId: 4, sourceVersion: '2', title: 'Impresora de caja', chunkIndex: 0 }],
          ticketId: null,
        },
      },
    }).as('ask')

    cy.visit('/ai/assistant')
    cy.get('#ai-question').type('La impresora de caja no imprime')
    cy.contains('button', 'Preguntar').click()
    cy.wait('@ask').its('request.body').should('deep.equal', { question: 'La impresora de caja no imprime' })

    cy.get('[data-testid=ai-label]').should('contain', 'Generado por IA').and('contain', 'revisión humana')
    cy.get('[data-testid=ai-references]').should('contain', 'versión 2')
  })

  it('muestra un mensaje de servicio no disponible sin presentarlo como recomendación y conserva la pregunta', () => {
    cy.intercept('POST', '**/api/v1/ai/queries', {
      statusCode: 503,
      body: { error: { code: 'AI_UNAVAILABLE', message: 'El asistente no está disponible en este momento.' } },
    }).as('ask')

    cy.visit('/ai/assistant')
    cy.get('#ai-question').type('Mi router no conecta')
    cy.contains('button', 'Preguntar').click()
    cy.wait('@ask')

    cy.get('[data-testid=ai-error]').should('contain', 'no está disponible')
    cy.get('[data-testid=ai-result]').should('not.exist')
    cy.get('#ai-question').should('have.value', 'Mi router no conecta')
  })
})
