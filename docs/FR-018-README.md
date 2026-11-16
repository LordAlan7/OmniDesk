# FR-018 — Seguimiento de tickets

## Alcance implementado
- Inicio → Mis tickets (`/my-tickets`) → detalle (`/my-tickets/:id`).
- Propiedad: exclusivamente `createdBy` de la sesión, incluso para roles de supervisión. No hay representación ni cuentas externas.
- Búsqueda por ID exacto, estado, paginación, totales y restablecimiento; los filtros se aplican antes de contar/paginar.
- Consulta al entrar y botón Actualizar. Los datos se retiran durante consultas y errores; no se presentan datos anteriores como recientes. Las respuestas tardías se descartan.
- Detalle y actualizaciones usan el repositorio existente (PostgreSQL en ejecución normal). No se duplica información ni se requieren migraciones.
- Se muestran creación, cambios válidos de estado, tienda/modelo y resolución actual cuando está resuelto/cerrado. La resolución se considera texto compartible en esta propuesta de política. No introducir investigaciones privadas en ese campo.
- Se excluyen prioridad, plazo, datos del técnico, autores, motivos de reasignación, comentarios de cierre, notas internas y eventos desconocidos. Las notas compartidas necesitan un contrato explícito de publicación antes de incorporarse.
- `lastVisibleUpdateAt` se calcula únicamente con eventos públicos, ordenados por fecha e ID. No se devuelve `updatedAt` ni `version` en consultas de solicitantes.
- El historial completo solo se conserva para supervisores con permiso de historial y lectura global, o el técnico asignado con permiso de historial. Tener el rol Administrator no concede acceso global.
- La política también se aplica en GET /tickets, /tickets/:id e /history, para evitar accesos alternativos. El detalle genérico dirige los registros públicos a la vista de seguimiento.
- No se conceden permisos de edición o gestión. No se modifican los endpoints de escritura existentes.

## Instalación
Aplicar en la raíz de OmniDesk, rama mariana, después de comprobar `git status`. El ZIP contiene únicamente archivos nuevos o modificados, con rutas apps/, docs/ y scripts/. Revisar el diff antes del commit. No reemplazar package.json ni instalar dependencias nuevas.

## Validación
Ejecutado aquí: `node scripts/verify-fr018.cjs` (Node 24): 17 comprobaciones de comportamiento aprobadas sobre el servicio real con repositorio simulado. Esto NO sustituye la suite HTTP, TypeScript, Vue ni PostgreSQL.

Pendiente ejecutar en el proyecto completo:

```powershell
npm --prefix apps/api run typecheck
npm --prefix apps/api test -- --runInBand
npm --prefix apps/web run type-check
npm --prefix apps/web run build-only
```

Se añade tickets.tracking.test.ts con pruebas Supertest de sesión, propiedad, filtros, totales, rechazo de parámetros de identidad e información privada en rutas nuevas y existentes. No pudo ejecutarse aquí: el ZIP no contiene node_modules ni configuración de TypeScript/Jest/Vite. No declarar QA completado hasta ejecutar los comandos y las verificaciones manuales.

## QA manual pendiente
1. Entrar como empleado con tickets y abrir Mis tickets desde Inicio.
2. Buscar ID propio, ajeno e inexistente; filtrar cada estado, restablecer y paginar.
3. Entrar con otra cuenta y probar las URLs directas de detalle e historial.
4. Cambiar estado con un rol autorizado; pulsar Actualizar como empleado y comprobar la cronología.
5. Resolver/cerrar con usuarios autorizados y comprobar resolución y fechas.
6. Insertar un evento interno en entorno de prueba: no debe aparecer ni alterar la última actualización visible.
7. Cortar la conexión y reintentar; comprobar estados de error, lista vacía y ausencia de resultados por separado.
8. Comprobar sesión vencida, navegación rápida entre detalles y operaciones existentes de asignación/clasificación.
9. Verificar controles de evidencia en FR-004: estas pantallas no agregan enlaces a archivos ni amplían sus permisos.

La definición de campos públicos propuesta debe validarse con el responsable del proyecto. Notas públicas, representación, adjuntos y nuevas políticas de plazo/técnico requieren su integración específica; no se simulan datos faltantes.
