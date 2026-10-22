# apps/web (Vue 3 + TypeScript + Pinia + Vue Router)

Aplicación web desarrollada con Vue 3, TypeScript y Vite. Utiliza Pinia para la gestión del estado, Vue Router para la navegación y cuenta con pruebas unitarias y end-to-end.

## Recommended IDE Setup

Se recomienda utilizar [VS Code](https://code.visualstudio.com/) con la extensión [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar). Se recomienda deshabilitar Vetur para evitar conflictos.

## Recommended Browser Setup

Para navegadores basados en Chromium (Chrome, Edge y Brave):

- [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
- [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)

Para Firefox:

- [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vuejs-devtools/)
- [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TypeScript

TypeScript no reconoce de forma nativa la información de tipos de los archivos `.vue`. Por ello, se utiliza `vue-tsc` para realizar la comprobación de tipos y proporcionar soporte adecuado para Vue Single-File Components.

Se recomienda utilizar la extensión Vue (Official) en VS Code para obtener soporte de TypeScript dentro de los archivos `.vue`.

## Project Setup

Desde la raíz del repositorio, ejecuta:

```bash
cd apps/web
npm install
```

Si la instalación falla con un error relacionado con `edgesOut`, intenta ejecutar:

```bash
npm install --legacy-peer-deps
```

Crea el archivo de variables de entorno a partir del ejemplo:

```bash
cp .env.example .env
```

Configura `VITE_API_URL` en el archivo `.env` con la URL de la API.

## Development

Inicia el servidor de desarrollo con recarga automática:

```bash
npm run dev
```

La aplicación estará disponible en:

`http://localhost:5173`

## Project Structure

### Session and Authentication

- `src/api/http.ts`: cliente HTTP utilizado para comunicarse con la API.
- `src/stores/session.ts`: store de Pinia encargado de administrar el estado de la sesión.
- `src/router/index.ts`: configuración de Vue Router, incluyendo guards de navegación basados en permisos.
- `src/services/session.ts`: adaptador sobre el store de sesión para compartir la misma lógica de sesión entre las distintas partes de la aplicación.

### User Management (FR-002)

La gestión de usuarios incluye las siguientes vistas y servicios:

- `src/views/UsersView.vue`: vista principal de gestión de usuarios.
- `src/views/CreateUserView.vue`: creación de usuarios.
- `src/views/EditUserView.vue`: edición de usuarios.
- `src/services/users.ts`: servicios para las operaciones relacionadas con usuarios.

## Testing

### Unit Tests with Vitest

Ejecuta las pruebas unitarias con:

```bash
npm run test:unit
```

### End-to-End Tests with Cypress

Para ejecutar las pruebas end-to-end contra el servidor de desarrollo de Vite:

```bash
npm run test:e2e:dev
```

Este modo permite ejecutar las pruebas directamente contra el servidor de desarrollo y suele ser más rápido durante la implementación.

Para ejecutar las pruebas contra la versión de producción:

```bash
npm run test:e2e
```

Este comando utiliza la aplicación de previsualización de Vite en el puerto `4173`. La API debe estar en ejecución para que las pruebas que dependen de ella funcionen correctamente.

Antes de ejecutar las pruebas contra la versión de producción, compila la aplicación:

```bash
npm run build
npm run test:e2e
```

Se recomienda ejecutar estas pruebas antes de desplegar la aplicación, especialmente en entornos de integración continua (CI).

## Linting

Ejecuta el análisis estático del código con:

```bash
npm run lint
```

El proyecto utiliza Oxlint y ESLint para detectar problemas y mantener la calidad del código.

## Production Build

Para comprobar los tipos de TypeScript y generar la versión optimizada para producción:

```bash
npm run build
```

La compilación incluye la comprobación de tipos mediante `vue-tsc` y la generación de los archivos de producción con Vite.

## Customize Configuration

Para consultar las opciones de configuración del servidor de desarrollo y del proceso de compilación, revisa la [Vite Configuration Reference](https://vite.dev/config/).
