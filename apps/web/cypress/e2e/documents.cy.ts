// Requires the migrated backend on :3000 and a running Vue app.
// Override qaPassword / qaTechnician / qaManager / qaEmployee via Cypress.env.
describe('FR-012 manuales', () => {
  const title=`Manual QA ${Date.now()}`
  function login(role: 'Technician' | 'Manager' | 'Employee') {
    cy.visit('/login')
    const defaults={Technician:'technician@company.com',Manager:'manager@company.com',Employee:'employee@company.com'}
    cy.get('#email').type(Cypress.env(`qa${role}`) || defaults[role])
    cy.get('#password').type(Cypress.env('qaPassword') || 'ChangeMe123!',{log:false})
    cy.contains('button','Iniciar sesión').click()
    cy.location('pathname').should('not.eq','/login')
    cy.visit('/knowledge/documents')
    cy.contains('h1','Manuales y documentación').should('be.visible')
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
