// Requires the migrated backend on :3000 and a running Vue app.
// Override qaPassword / qaTechnician / qaManager / qaEmployee via Cypress.env.
describe('FR-012 manuales', () => {
  const title=`Manual QA ${Date.now()}`

function login(role: 'Technician' | 'Manager' | 'Employee') {
  const defaults = {
    Technician: 'technician@company.com',
    Manager: 'manager@company.com',
    Employee: 'employee@company.com',
  }

  const emailKey = `qa${role}`

  cy.clearAllSessionStorage()
  cy.visit('/login')

  cy.env([emailKey, 'qaPassword']).then((values) => {
    const email = values[emailKey] || defaults[role]
    const password = values.qaPassword

    if (!password) {
      throw new Error(
        'Configura CYPRESS_qaPassword para ejecutar las pruebas.'
      )
    }


cy.get('#email').type(email)
cy.get('#password').type(password, { log: false })

cy.intercept('POST', '**/api/v1/auth/login')
  .as('loginQa')

cy.contains('button', 'Iniciar sesión').click()

cy.wait('@loginQa').then(({ response }) => {
  cy.log(`Estado HTTP: ${response?.statusCode ?? 'sin respuesta'}`)

  expect(response?.statusCode, 'respuesta del login')
    .to.eq(200)
})

  })

  cy.location('pathname').should('not.eq', '/login')
  cy.visit('/knowledge/documents')

  cy.contains('h1', 'Manuales y documentación')
    .should('be.visible')
}

  function find() {
    cy.get('input[placeholder="Título, descripción, categoría o fuente"]').clear().type(title)
    cy.contains('button','Buscar').click()
  }
  it('carga, edita, publica, consulta y retira un PDF con roles reales', () => {
    login('Technician')
    cy.contains('button','Cargar documento').click()
    cy.contains('label','Título *').find('input').type(title)
    cy.contains('label','Descripción *').find('textarea').type('Manual para pruebas FR-012')
    cy.contains('label','Categoría *').find('select').select('Manuales')
    cy.contains('label','Fuente o entidad emisora *').find('input').type('Fabricante QA')
    cy.get('input[type=file]').selectFile('cypress/fixtures/manual-fr012.pdf')
    cy.contains('button','Guardar').click()
    cy.contains('Documento guardado.').should('be.visible')
    cy.contains('button','Editar metadatos').click()
    cy.contains('label','Descripción *').find('textarea').clear().type('Descripción corregida QA')
    cy.contains('button','Guardar').click()
    cy.contains('Documento guardado.').should('be.visible')
    login('Employee');find()
    cy.contains('Sin resultados para estos filtros.').should('be.visible')
    login('Manager');find()
    cy.contains('button',title).click()
    cy.get('.publication select').select('Publicado')
    cy.contains('button','Guardar estado y acceso').click()
    cy.contains('Estado y acceso actualizados.').should('be.visible')
    login('Employee');find();cy.contains('button',title).click()
    cy.contains('Descripción corregida QA').should('be.visible')
    cy.contains('button','Editar metadatos').should('not.exist')
    cy.intercept('GET','**/knowledge/documents/*/content').as('download')
    cy.contains('button','Descargar PDF').click()
    cy.wait('@download').its('response.statusCode').should('eq',200)
    login('Manager');find();cy.contains('button',title).click()
    cy.get('.publication select').select('Retirado')
    cy.contains('button','Guardar estado y acceso').click()
    cy.contains('Estado y acceso actualizados.').should('be.visible')
    login('Employee');find()
    cy.contains('Sin resultados para estos filtros.').should('be.visible')
  })
})
