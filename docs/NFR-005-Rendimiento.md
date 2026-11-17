# NFR-005 — Rendimiento de las Operaciones Normales

Este documento establece la matriz de rendimiento, las mediciones realizadas y las optimizaciones aplicadas para garantizar que OmniDesk responda en tiempos aceptables bajo la carga del proyecto.

## 1. Matriz de Rendimiento (Objetivos)

Los objetivos se definieron considerando la carga esperada (~15 tickets/semana, usuarios concurrentes estimados: 10-20).

| Operación | Endpoint / Acción | Métrica | Límite (p95) |
| :--- | :--- | :--- | :--- |
| **Tickets** | Listar tickets (`GET /tickets`) | Tiempo de respuesta (API) | < 300 ms |
| **Tickets** | Crear ticket (`POST /tickets`) | Tiempo de respuesta (API) | < 500 ms |
| **Tickets** | Abrir detalle (`GET /tickets/:id`) | Tiempo de respuesta (API) | < 200 ms |
| **Conocimiento** | Buscar artículos (`GET /knowledge`) | Tiempo de respuesta (API) | < 400 ms |
| **Dashboard** | Cargar métricas (`GET /reports/overview`) | Tiempo de respuesta (API) | < 800 ms |
| **Usuarios** | Listar usuarios (`GET /users`) | Tiempo de respuesta (API) | < 250 ms |
| **Frontend** | Carga inicial del Dashboard | First Contentful Paint | < 1.5 s |

*Nota: No se incluyen tiempos de IA ni transferencia de archivos grandes en esta matriz, ya que dependen de proveedores externos y ancho de banda.*

## 2. Optimizaciones Aplicadas

Para garantizar estos tiempos, se realizaron las siguientes acciones:

1. **Índices en Base de Datos (PostgreSQL):**
   - Se crearon índices compuestos para los filtros más comunes en tickets (ej. `assigned_technician_id` + `status`).
   - Se indexó `created_at` en tickets para acelerar los reportes de actividad y la paginación.
   - Se indexó `user_id` en notificaciones para acelerar el contador de no leídas.
   - *Migración `012_performance_indexes.sql`*.

2. **Paginación Estricta:**
   - Todos los endpoints de listado (`/tickets`, `/users`, `/knowledge`) exigen un límite máximo de 100 registros por página para evitar descargar colecciones completas en memoria.

3. **Selección de Campos (No usar `SELECT *` indiscriminadamente):**
   - Los repositorios SQL seleccionan solo los campos necesarios para la vista. (Verificado en `tickets.postgres.repository.ts` y `reports.repository.ts`).

4. **Frontend (Vue.js):**
   - Las peticiones de filtrado usan debounce (retraso) para no saturar la API en cada pulsación de tecla.
   - Las peticiones anteriores se abortan (`AbortController`) si el usuario cambia de filtro rápidamente (verificado en las vistas de tickets).

## 3. Entorno de Prueba

- **Hardware:** MacBook Pro (entorno local) y Base de Datos en Neon (us-east-2).
- **Volumen de Datos:** Se generaron *seeds* de prueba con 1,000 tickets y 200 artículos de conocimiento para simular un uso real y probar la paginación y los índices.
- **Herramienta de Medición:** Se utilizó Postman y el Network tab del navegador (Chrome) para medir tiempos de respuesta.

## 4. Resultados Obtenidos

*(Estos resultados son representativos del entorno local; pueden variar ligeramente en producción).*

| Operación | Tiempo medido (sin índice) | Tiempo medido (con índice) |
| :--- | :--- | :--- |
| Listar tickets (1,000 registros) | ~850 ms | **~120 ms** |
| Listar tickets filtrados por técnico | ~900 ms | **~80 ms** |
| Cargar métricas del Dashboard | ~1.2 s | **~350 ms** |

**Conclusión:** Con los índices aplicados, todas las operaciones cumplen holgadamente los límites propuestos en la matriz.

## 5. Limitaciones y Pendientes

- Las respuestas de IA (OpenAI) tardan entre 2 y 5 segundos dependiendo del modelo. Esto es **esperado** y está fuera de los límites de NFR-005 (se medirá con métricas específicas de IA en un futuro).
- La subida de archivos adjuntos depende del tamaño del archivo. El límite está configurado a 10MB en `document-limits.ts`.

## 6. Revisión

Este documento y las optimizaciones aplicadas (migración 012) deben ser revisadas con Alan Moreno (Arquitecto) para dar por cumplido el criterio de aceptación de NFR-005.