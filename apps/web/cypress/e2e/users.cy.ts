describe('FR-002 - Gestión de usuarios', () => {
  function uniqueId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function login(account: string) {
    cy.intercept('POST', '**/auth/login').as('loginRequest')
       cy.intercept('GET', '**/auth/me', (request) => {
      delete request.headers['if-none-match']
      delete request.headers['if-modified-since']
    }).as('profileRequest')

    cy.visit('/login')

    cy.get('#email')
      .should('be.enabled')
      .clear()
      .type(account)

    cy.get('#password')
      .clear()
      .type('ChangeMe123!', { log: false })

    cy.get('button[type="submit"]').click()

    cy.wait('@loginRequest', { timeout: 15000 }).then(
      ({ request, response }) => {
        expect(request.body.email).to.eq(account)
        expect(response?.statusCode).to.eq(200)
      },
    )

    cy.wait('@profileRequest', { timeout: 15000 }).then(
      ({ response }) => {
        expect(response?.statusCode).to.eq(200)
      },
    )

    cy.location('pathname', { timeout: 15000 })
      .should('eq', '/users')

    cy.get('#search').should('be.enabled')
  }

  function findUser(email: string, state: 'true' | 'false') {
    cy.get('#search')
      .should('be.enabled')
      .clear()
      .type(email)

    cy.get('#role').select('Technician')
    cy.get('#active').select(state)
    cy.get('form.filters').submit()

    cy.contains('tbody tr', email).should('be.visible')
    cy.get('#search').should('have.value', email)
    cy.get('#role').should('have.value', 'Technician')
    cy.get('#active').should('have.value', state)
    cy.get('#search').should('be.enabled')
  }

  it('crea un técnico, conserva sus datos y cambia su estado', () => {
    const unique = uniqueId()
    const name = `Tecnico Cypress ${unique}`
    const email = `cypress.${unique}@company.com`

    login('admin@company.com')

    cy.get('a[href="/users/new"]').click()
    cy.location('pathname').should('eq', '/users/new')

    cy.get('#name').should('be.enabled').type(name)
    cy.get('#email').type(email)
    cy.get('#password').type('CypressTecnico123!', { log: false })

    cy.get('input[type="checkbox"][value="Technician"]').check()
    cy.get('button[type="submit"]').click()

    cy.location('pathname').should('eq', '/users')
    findUser(email, 'true')

    cy.contains('tbody tr', email).within(() => {
      cy.contains('td', name).should('be.visible')
      cy.contains('.badge', /^Activo$/).should('be.visible')
    })

    cy.reload()
    findUser(email, 'true')

    cy.intercept('PATCH', '**/users/*').as('statusChange')
    cy.on('window:confirm', () => true)

    cy.contains('tbody tr', email).within(() => {
      cy.contains('button', /^Desactivar$/).click()
    })

    cy.wait('@statusChange', { timeout: 15000 }).then(
      ({ request, response }) => {
        expect(request.body.active).to.eq(false)

        expect(
          response?.statusCode,
          JSON.stringify(response?.body),
        ).to.eq(200)

        expect(response?.body.data.active).to.eq(false)
      },
    )

    cy.get('#search').should('be.enabled')
    cy.contains('tbody tr', email).should('not.exist')

    findUser(email, 'false')

    cy.contains('tbody tr', email).within(() => {
      cy.contains('.badge', /^Inactivo$/).should('be.visible')
      cy.contains('button', /^Activar$/).click()
    })

    cy.wait('@statusChange', { timeout: 15000 }).then(
      ({ request, response }) => {
        expect(request.body.active).to.eq(true)
        expect(response?.statusCode).to.eq(200)
        expect(response?.body.data.active).to.eq(true)
      },
    )

    cy.get('#search').should('be.enabled')
    cy.contains('tbody tr', email).should('not.exist')

    findUser(email, 'true')

    cy.contains('tbody tr', email).within(() => {
      cy.contains('.badge', /^Activo$/).should('be.visible')
    })
  })

  it('permite al gerente consultar sin mostrar acciones administrativas', () => {
    login('manager@company.com')

    cy.get('tbody tr').should('have.length.greaterThan', 0)
    cy.get('a[href="/users/new"]').should('not.exist')
    cy.get('.row-actions').should('not.exist')

    cy.visit('/users/new')

    cy.location('pathname').should('eq', '/access-denied')
    cy.get('#password').should('not.exist')
  })

  it('protege el listado cuando no hay sesión', () => {
    cy.visit('/login')

    cy.window().then((window) => {
      window.sessionStorage.clear()
    })

    cy.visit('/users')

    cy.location('pathname').should('eq', '/login')
    cy.get('tbody tr').should('not.exist')
  })

  it('conserva los datos ante un error y persiste la edición al reintentar', () => {
    login('admin@company.com')

    const suffix = uniqueId()
    const originalName = `Usuario edicion ${suffix}`
    const updatedName = `Usuario actualizado ${suffix}`
    const originalEmail = `edicion.${suffix}@company.com`
    const updatedEmail = `actualizado.${suffix}@company.com`

    cy.window().then((window) => {
      const token = window.sessionStorage.getItem('omnidesk.accessToken')

      expect(token, 'sesión del administrador').to.be.a('string')

      return cy.request({
        method: 'POST',
        url: 'http://localhost:3000/api/v1/users',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          name: originalName,
          email: originalEmail,
          password: 'CypressEdicion123!',
          roles: ['Technician'],
        },
      })
    }).then((response) => {
      expect(response.status).to.eq(201)
      cy.visit(`/users/${response.body.data.id}/edit`)
    })

    cy.get('#name')
      .should('be.enabled')
      .should('have.value', originalName)
      .clear()
      .type(updatedName)

    cy.get('#email')
      .should('have.value', originalEmail)
      .clear()
      .type(updatedEmail)

    cy.get('input[type="checkbox"][value="Employee"]').check()

    cy.get('input[type="checkbox"][value="Technician"]')
      .should('be.checked')

    cy.on('window:confirm', () => true)

    cy.intercept(
      {
        method: 'PATCH',
        url: '**/users/*',
        times: 1,
      },
      {
        statusCode: 500,
        body: {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Fallo de guardado simulado por QA.',
          },
        },
      },
    ).as('failedSave')

    cy.get('button[type="submit"]').click()
    cy.wait('@failedSave')

    cy.get('[role="alert"]')
      .should('contain.text', 'Fallo de guardado simulado por QA.')

    cy.get('.success').should('not.exist')
    cy.get('#name').should('have.value', updatedName)
    cy.get('#email').should('have.value', updatedEmail)

    cy.get('input[type="checkbox"][value="Employee"]')
      .should('be.checked')

    cy.intercept('PATCH', '**/users/*').as('successfulSave')

    cy.get('button[type="submit"]')
      .should('be.enabled')
      .click()

    cy.wait('@successfulSave').then(({ response }) => {
      expect(
        response?.statusCode,
        JSON.stringify(response?.body),
      ).to.eq(200)

      expect(response?.body.data.name).to.eq(updatedName)
      expect(response?.body.data.email).to.eq(updatedEmail)

      expect(response?.body.data.roles)
        .to.have.members(['Employee', 'Technician'])
    })

    cy.get('.success')
      .should('contain.text', 'Los cambios se guardaron correctamente.')

    cy.reload()

    cy.get('#name')
      .should('be.enabled')
      .should('have.value', updatedName)

    cy.get('#email').should('have.value', updatedEmail)

    cy.get('input[type="checkbox"][value="Employee"]')
      .should('be.checked')

    cy.get('input[type="checkbox"][value="Technician"]')
      .should('be.checked')

    cy.get('input[type="password"]').should('not.exist')
  })

  it('retira el formulario abierto cuando el servidor informa pérdida de permisos', () => {
    login('admin@company.com')

    cy.get('a[href="/users/new"]').click()

    cy.get('#name')
      .should('be.enabled')
      .type('Cuenta sin guardar')

    // Simular permisos retirados sin modificar al administrador real.
    cy.intercept('GET', '**/auth/me', (request) => {
      request.continue((response) => {
        response.body.data.permissions = []
      })
    }).as('revokedPermissions')

    cy.window().then((window) => {
      window.dispatchEvent(new window.Event('focus'))
    })

    cy.wait('@revokedPermissions', { timeout: 15000 })

    cy.location('pathname', { timeout: 15000 })
      .should('eq', '/access-denied')

    cy.get('#name').should('not.exist')
    cy.get('#email').should('not.exist')
    cy.get('#password').should('not.exist')
    cy.get('button[type="submit"]').should('not.exist')
  })
})