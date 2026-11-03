# NFR-011 — Evidencias de compatibilidad con navegadores de escritorio

- **Proyecto:** OmniDesk
- **Requerimiento:** NFR-011 — Compatibilidad con navegadores de escritorio
- **Prioridad:** Should Have
- **Responsable:** Mariana Núñez de la Hoya
- **Validación QA:** Edgar Alan Meráz Casas
- **Fecha de registro:** 1 de noviembre de 2026
- **Estado:** En validación final; pendiente de consolidar evidencias y obtener aceptación de QA
**Avance estimado:** 92 % (estimación de seguimiento; no equivale a aceptación formal)

## 1. Objetivo

Comprobar que las funciones principales de OmniDesk puedan utilizarse en los navegadores de escritorio Google Chrome y Microsoft Edge, sin problemas importantes de navegación, visualización o interacción.

## 2. Entorno de pruebas

| Elemento | Configuración utilizada |
|---|---|
| Aplicación | OmniDesk — frontend Vue y API Node.js |
| Frontend local | `http://localhost:5173` |
| API local | `http://localhost:3000` |
| Navegadores | Google Chrome 156 y Microsoft Edge 156 |
| Sistema operativo | Windows; registrar edición y compilación exactas antes del cierre |
| Automatización | Cypress 16.2.0, pruebas en modo headless |
| Herramienta de pruebas | Node.js 24.19.0 en las ejecuciones observadas |
| Resoluciones evaluadas en Cypress | 1280 × 720, 1366 × 768 y 1920 × 1080 |
| Zoom manual del navegador | 80 %, 100 % y 125 % |

> **Nota:** Las resoluciones indicadas se comprobaron como tamaños de viewport en Cypress, no como certificación de monitores físicos. Las versiones de Chrome y Edge están respaldadas por los registros que muestran su versión principal (156). Antes de la entrega se debe adjuntar la versión exacta y la compilación del sistema operativo.

## 3. Matriz de compatibilidad funcional

| Funcionalidad / evidencia | Google Chrome 156 | Microsoft Edge 156 | Observaciones |
|---|---|---|---|
| Autenticación y permisos — `auth.cy.ts` | Aprobado: 8/8 | Aprobado: 8/8 | Se comprobó inicio de sesión, control de acceso, recarga y cierre de sesión. Hubo fallos en ejecuciones previas, corregidos antes de las ejecuciones satisfactorias. |
| Creación y seguimiento de tickets — `create-ticket.cy.ts` | Aprobado: 2/2 | Aprobado: 2/2 | Ejecuciones individuales satisfactorias. |
| Documentos PDF — `documents.cy.ts` | Aprobado: 1/1 | Aprobado: 1/1 | Ejecuciones individuales satisfactorias, con cuentas de prueba. |
| Dashboard principal y Panel de soporte — `dashboard.cy.ts` | Aprobado: 3/3 | Aprobado: 3/3 | Incluye comprobaciones de roles, métricas y tamaños de viewport. |
| Dashboard principal a zoom 80 %, 100 % y 125 % | Revisado visualmente | Revisado manualmente por la responsable | En Chrome se revisaron capturas; la revisión de Edge fue reportada como correcta. |
| Panel de soporte a zoom 80 %, 100 % y 125 % | Revisado visualmente | Revisado manualmente por la responsable | En Chrome se revisaron capturas; la revisión de Edge fue reportada como correcta. |
| Navegación por teclado: Tab, Shift+Tab y Enter | Revisado manualmente | Revisado manualmente | Se reportó foco visible y acceso a controles del Panel de soporte. |

**Resumen de las pruebas funcionales:** 14 casos aprobados por navegador, **28 resultados satisfactorios** entre Chrome y Edge en ejecuciones individuales. No se ha registrado todavía una ejecución integral que abarque todo el conjunto de pruebas de la aplicación.

## 4. Comprobaciones visuales y de interacción

Se revisaron el Dashboard principal y el Panel de soporte a zoom 80 %, 100 % y 125 %. En las capturas de Chrome no se observaron superposiciones importantes ni recortes evidentes en los elementos visibles. La responsable confirmó que las vistas también se ven bien en Edge. La presencia de contenido más abajo de la ventana es normal cuando puede consultarse mediante desplazamiento vertical.

La navegación con teclado se comprobó manualmente en ambos navegadores: recorrido con `Tab` y `Shift+Tab`, activación mediante `Enter`, identificación visible del foco y uso de controles del Panel de soporte.

**Límite de la evidencia:** las capturas revisadas muestran la parte visible de las pantallas. Para completar el expediente conviene adjuntar también capturas de las secciones inferiores, especialmente filtros, tablas y actividad del Panel de soporte, y guardar evidencias de Edge.

## 5. Inventario y ubicación sugerida de evidencias

Guardar en el repositorio bajo `docs/evidencias/NFR-011/`:

| Archivo sugerido | Qué debe contener | Situación |
|---|---|---|
| `entorno.txt` | Sistema operativo, versión exacta de Chrome y Edge, Node y Cypress | Pendiente de guardar |
| `chrome-auth.txt` y `edge-auth.txt` | Resultados finales de Cypress para `auth.cy.ts` | Ejecuciones aprobadas; faltan registros persistentes |
| `chrome-create-ticket.txt` y `edge-create-ticket.txt` | Resultados de Cypress para `create-ticket.cy.ts` | Ejecuciones aprobadas; faltan registros persistentes |
| `chrome-documents.txt` y `edge-documents.txt` | Resultados de Cypress para `documents.cy.ts` | Ejecuciones aprobadas; faltan registros persistentes |
| `chrome-dashboard.txt` y `edge-dashboard.txt` | Resultados de Cypress para `dashboard.cy.ts` | Ejecuciones aprobadas; faltan registros persistentes |
| `chrome-dashboard-zoom-80.png`, `...-100.png`, `...-125.png` | Capturas del Dashboard principal en Chrome | Capturas compartidas en la conversación; falta integrarlas al repositorio |
| `chrome-soporte-zoom-80.png`, `...-100.png`, `...-125.png` | Capturas del Panel de soporte en Chrome | Capturas compartidas en la conversación; falta integrarlas al repositorio |
| `edge-dashboard-zoom-80.png`, `...-100.png`, `...-125.png` | Capturas del Dashboard principal en Edge | Falta adjuntarlas |
| `edge-soporte-zoom-80.png`, `...-100.png`, `...-125.png` | Capturas del Panel de soporte en Edge | Falta adjuntarlas |
| `teclado-chrome-edge.md` | Fecha, comprobaciones realizadas y resultado manual | Pendiente de registrar por escrito |

No introducir contraseñas, tokens ni datos personales reales en las capturas o en los logs.

## 6. Pendientes para el cierre

- [ ] Guardar registros verificables de las ejecuciones finales de Cypress y el entorno, sin secretos.
- [ ] Integrar las capturas existentes de Chrome y capturar la evidencia faltante de Edge.
- [ ] Documentar por escrito la comprobación de teclado y las posibles observaciones.
- [ ] Revisar si el alcance acordado del NFR-011 exige probar otros flujos (`users`, `notifications`, `fr009`, `priority`) en ambos navegadores.
- [ ] Obtener revisión y aceptación de QA por Edgar Alan Meráz Casas.
- [ ] Confirmar que no quedan defectos críticos de compatibilidad y registrar el resultado definitivo.

## 7. Conclusión provisional

Las pruebas ejecutadas muestran que la autenticación, la creación y seguimiento de tickets, la administración de documentos y los Dashboards funcionan en Google Chrome 156 y Microsoft Edge 156 dentro de los escenarios verificados. También se realizaron revisiones de zoom y navegación con teclado sin problemas reportados. El requerimiento cuenta con evidencia funcional y manual importante, pero aún necesita reunir los archivos de evidencia, completar el alcance acordado y recibir la validación de QA para considerarse formalmente cerrado.
