/**
 * Requiere: API corriendo en :3000 (cuentas semilla) y el frontend en :5173.
 *   npm run dev:api   |   npm run dev:web   |   npm run test:e2e --prefix apps/web
 */
const PASSWORD = "ChangeMe123!";
const API = () => "http://localhost:3000/api/v1";

function loginViaUi(email: string, password = PASSWORD) {
  cy.visit("/login");
  cy.get("[data-testid=login-email]").type(email);
  cy.get("[data-testid=login-password]").type(password);
  cy.get("[data-testid=login-submit]").click();
}

describe("FR-001 autenticación y acceso por roles", () => {
  beforeEach(() => cy.clearAllSessionStorage());

  it("campos vacíos no envían el formulario y muestran errores", () => {
    cy.visit("/login");
    cy.get("[data-testid=login-submit]").click();
    cy.get("[data-testid=login-email-error]").should("be.visible");
    cy.get("[data-testid=login-password-error]").should("be.visible");
    cy.location("pathname").should("eq", "/login");
  });

  it("credenciales incorrectas y cuenta inactiva muestran el mismo mensaje genérico", () => {
    loginViaUi("employee@company.com", "incorrecta");
    cy.get("[data-testid=login-error]").should(
      "have.text",
      "Correo o contraseña incorrectos.",
    );
    cy.reload();
    loginViaUi("inactive@company.com");
    cy.get("[data-testid=login-error]").should(
      "have.text",
      "Correo o contraseña incorrectos.",
    );
  });

  it("empleado: entra, no ve Usuarios y /admin/users muestra acceso denegado", () => {
    loginViaUi("employee@company.com");
    cy.location("pathname").should("eq", "/");
    cy.get("[data-testid=nav-tickets]").should("exist");
    cy.get("[data-testid=nav-admin]").should("not.exist");
    cy.visit("/admin/users");
    cy.get("[data-testid=forbidden-title]").should("be.visible");
  });

  it("administrador ve la sección Usuarios", () => {
    loginViaUi("admin@company.com");
    cy.get("[data-testid=nav-admin]").click();
    cy.get("[data-testid=user-list]").should("be.visible");
  });

  it("ruta protegida sin sesión redirige a login", () => {
    cy.visit("/tickets");
    cy.location("pathname").should("eq", "/login");
  });

  it("recargar conserva la sesión vigente", () => {
    loginViaUi("technician@company.com");
    cy.reload();
    cy.get("[data-testid=dashboard-title]").should(
      "contain",
      "Demo Technician",
    );
  });

  it("la API rechaza con 403 al empleado aunque llame directo (sin pasar por la UI)", () => {
    cy.request("POST", `${API()}/auth/login`, {
      email: "employee@company.com",
      password: PASSWORD,
    })
      .its("body.data.accessToken")
      .then((token) => {
        cy.request({
          url: `${API()}/users`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
      });
  });

  it("logout vuelve al login y el token anterior ya no sirve (401)", () => {
    loginViaUi("manager@company.com");
    cy.window().then((win) => {
      const token = win.sessionStorage.getItem("omnidesk.token");
      cy.get("[data-testid=nav-logout]").click();
      cy.location("pathname").should("eq", "/login");
      cy.request({
        url: `${API()}/auth/me`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 401);
    });
  });
});
