// Sin importar 'cypress' para que `npm run type-check` funcione aunque aún no esté instalado.
export default {
  e2e: {
    baseUrl: "http://localhost:5173",
    supportFile: false,
    specPattern: "cypress/e2e/**/*.cy.ts",
  },
};
