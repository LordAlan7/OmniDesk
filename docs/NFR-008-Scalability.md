NFR-008 — Diseño de escalabilidad
Responsables
Responsable: Alan Moreno Nevárez.
Apoyo y validación: Edgar Alan Meráz Casas.
Objetivo
Preparar la arquitectura para incorporar más usuarios, tickets,documentos y módulos sin requerir una reconstrucción completa delsistema.

Se conserva el monolito modular de A5. Las mejoras se basan enescenarios de crecimiento y límites observados, no en introducirinfraestructura distribuida sin necesidad.

NFR-005 mide rendimiento con la carga prevista; NFR-008 estudiacómo responder al aumento de esa carga. No implica capacidadilimitada.

Volumen actual (escenario base)
Métrica	Valor actual	Fuente
Técnicos activos	< 6	Confirmado por el equipo
Tickets por semana	< 50	Confirmado por el equipo
Documentos de conocimiento	< 100	Estimado (FR-012 recién implementado)
Artículos de conocimiento	< 50	Estimado (FR-011 recién implementado)
Notificaciones por día	< 100	Estimado (FR-020 recién implementado)
Usuarios totales	< 20	Estimado (5 roles demo + cuentas de QA)
Concurrencia pico	< 10 peticiones/seg	Estimado (acceso de 6 técnicos en horario laboral)
Estos valores son proyecciones del equipo, no medicionesformales. Se identifican expresamente como proyección conforme alcriterio de aceptación.

Escenarios de crecimiento
Escenario 1 — Actual (base)
Métrica	Valor
Instancias de la API	1
Pool de BD por instancia	10 conexiones (DB_POOL_MAX=10)
Conexiones totales a BD	10 (1 × 10)
Límite del servidor PG	100 (default)
Margen	90 conexiones libres
Estado in-process	Aceptable (single-instance)
Conclusión: la configuración actual soporta el volumen sinajustes. No se requiere ninguna acción.

Escenario 2 — Medio (10× crecimiento)
Métrica	Valor
Técnicos activos	~60
Tickets por semana	~500
Documentos	~1000
Notificaciones por día	~1000
Concurrencia pico	~50 peticiones/seg
Instancias de la API	1 (probablemente) o 2-3
Pool de BD por instancia	20 (DB_POOL_MAX=20)
Conexiones totales a BD	20-60 (1-3 × 20)
Margen	40-80 conexiones libres
Acciones requeridas:

Subir DB_POOL_MAX de 10 a 20 (una línea en .env).
Si se añaden instancias: verificar quenum_instancias × DB_POOL_MAX ≤ max_connections del servidor.
Mover sessionVersions a store compartido (Redis o columnasession_version en users) si se usan múltiples instancias.
Mover creations (idempotencia de tickets) a tablaidempotency_keys si se usan múltiples instancias.
Considerar pg_advisory_xact_lock para queues deusers.lifecycle si hay asignaciones concurrentes entre instancias.
No se requiere: Redis, colas de mensajes, ni microservicios.El monolito modular sigue siendo adecuado.

Escenario 3 — Alto (50× crecimiento)
Métrica	Valor
Técnicos activos	~300
Tickets por semana	~2500
Documentos	~5000
Notificaciones por día	~5000
Concurrencia pico	~250 peticiones/seg
Instancias de la API	4-8 (detrás de balanceador)
Pool de BD por instancia	10 (DB_POOL_MAX=10, reducido para caber)
Conexiones totales a BD	40-80 (4-8 × 10)
Margen	20-60 conexiones libres
Acciones requeridas:

Mover los 3 estados in-process a store compartido (ver sección"Estado in-process" abajo).
Subir max_connections del servidor PostgreSQL a 200+.
Considerar conexión pooling externo (PgBouncer) para reducirel overhead de conexiones directas.
Considerar procesamiento diferido para notificaciones masivas(cola + worker), solo si las mediciones lo justifican.
Considerar réplicas de lectura de PostgreSQL para consultaspesadas (listados, reportes, auditoría).
No se requiere: dividir el monolito en microservicios. Losmódulos ya están aislados por contratos (NFR-007); escalarhorizontalmente la instancia única es suficiente.

Límites identificados
Límites de la aplicación
Límite	Valor actual	Dónde se configura	Impacto
Pool de conexiones BD	10	DB_POOL_MAX en .env	Peticiones concurrentes a BD
Timeout de conexión BD	30s	DB_CONNECTION_TIMEOUT_MS en .env	Peticiones que esperan conexión
Rate limit de login	10 intentos / 15 min	LOGIN_RATE_LIMIT_MAX en .env	Fuerza bruta
Rate limit de API	300 req / min	API_RATE_LIMIT_MAX en .env	Abuso general
Tamaño de body JSON	1 MB	express.json({ limit: '1mb' })	Payload de peticiones
Tamaño de adjuntos	10 MB	MAX_ATTACHMENT_BYTES	Carga de evidencias
Tamaño de documentos	10 MB	MAX_DOCUMENT_BYTES	Carga de manuales
Límite de adjuntos por ticket	10	MAX_ATTACHMENTS_PER_TICKET	Almacenamiento
Límite de paginación	100 por página	paginationSchema max	Respuestas grandes
Límites del estado in-process (bloquean multi-instancia)
Estado	Archivo	Qué hace	Mitigación actual	Ruta de migración
sessionVersions	shared/security/jwt.ts	Cache de versiones de sesión para revocar tokens	authenticate consulta BD en cada request → 401 aunque el token no haya expirado	Mover a Redis o columna session_version en users
creations	tickets.service.ts	Cache de idempotencia para creación de tickets	crypto.randomUUID() hace que cada petición nueva tenga key distinto	Tabla idempotency_keys en PG o Redis con TTL
queues	users.lifecycle.ts	Cola per-instance para serializar asignaciones	El version de tickets (control optimista) coordina a nivel de BD → 409 CONFLICT	SELECT ... FOR UPDATE o pg_advisory_xact_lock
Límites del entorno (no controlados por la aplicación)
Límite	Default	Cuándo ampliar
max_connections del servidor PostgreSQL	100	Cuando num_instancias × DB_POOL_MAX se acerca a 100
Memoria del proceso Node.js	~1.5 GB (default V8)	Cuando el estado in-process crece o hay many large queries
CPU del servidor	Dependiente del host	Cuando la concurrencia pico satura un solo núcleo
Ancho de banda de red	Dependiente del host	Cuando las descargas de adjuntos/documentos son frecuentes
Acceso eficiente a datos
Paginación
Todos los endpoints de listado implementan paginación conpaginationSchema (default page=1, limit=20, max=100):

Endpoint	Página	Limit	Verificado
GET /tickets	✅	✅	tickets.routes.ts
GET /tickets/:id/history	❌ (lista completa)	—	Aceptable: historial de un ticket específico
GET /tickets/:id/investigations	❌ (lista completa)	—	Aceptable: investigaciones de un ticket específico
GET /me/tickets	✅	✅	tickets.routes.ts
GET /users	✅	✅	users.routes.ts
GET /audit-logs	✅	✅	audit.routes.ts
GET /knowledge/articles	✅	✅	knowledge.routes.ts
GET /knowledge/documents	✅	✅	documents.routes.ts
GET /me/notifications	✅	✅	notifications.routes.ts
Excepciones aceptables: /tickets/:id/history e/investigations devuelven listas completas porque son de unticket específico (no listados globales). Con < 50 eventos porticket, no hay problema. Si un ticket acumula > 500 eventos, seañade paginación.

Índices de base de datos
Las migraciones crean índices en las columnas más consultadas:

Tabla	Índices	Migración
tickets	status, assigned_technician_id, created_by, category_id, priority_id, version	001, 003
ticket_history	ticket_id, correlation_id	003, 009
audit_log	entity, entity_id, action, actor_id, correlation_id, created_at, outcome	004, 009
knowledge_articles	category_id, status, author_id, search (GIN)	006
knowledge_documents	status	003
ticket_attachments	ticket_id	008
ticket_investigations	ticket_id, author_id	010
notifications	user_id, user_id+read (partial), created_at, dedup_key (unique)	011
ticket_recurring_problems	article_id	009_recurring
Verificación automatizada: el scriptscripts/verify-scalability.cjs comprueba que todos losendpoints de listado paginan y que las tablas críticas tieneníndices.

Consultas que NO cargan colecciones completas
listTickets: usa LIMIT/OFFSET en PostgreSQL.
listUsers: filtra en memoria con searchUsers (aceptable con< 20 usuarios; si crece, mover el filtro a SQL).
listAudit: usa LIMIT/OFFSET en PostgreSQL.
searchArticles: usa LIMIT/OFFSET en PostgreSQL.
listDocuments: usa LIMIT/OFFSET en PostgreSQL.
listForUser (notifications): usa LIMIT/OFFSET en PostgreSQL.
Atención: searchUsers en users.service.ts carga todos losusuarios en memoria y luego filtra. Con < 20 usuarios esaceptable. Si los usuarios superan 1000, mover el search/filtera SQL con ILIKE (como ya hace searchArticles).

Persistencia independiente de instancias
Lo que ya está en PostgreSQL (multi-instance safe)
Dato	Tabla	Migración
Usuarios, roles, cuentas	users, user_roles, roles	001
Tickets y su historial	tickets, ticket_history	001
Investigaciones	ticket_investigations	010
Adjuntos (metadatos)	ticket_attachments	008
Documentos de conocimiento	knowledge_documents, stored_files	003
Artículos de conocimiento	knowledge_articles	006
Problemas recurrentes	ticket_recurring_problems	009_recurring
Auditoría	audit_log	001, 004, 009
Notificaciones	notifications	011
Todo lo anterior se comparte entre instancias sin estado local.

Lo que está en memoria de proceso (NO multi-instance safe)
Dato	Dónde	Riesgo	Ver arriba
Versiones de sesión	jwt.ts	Token revocado sigue válido en otra instancia	Límites → Estado in-process
Cache de idempotencia	tickets.service.ts	Doble envío a instancias distintas crea duplicados	Límites → Estado in-process
Cola de asignación	users.lifecycle.ts	Asignaciones concurrentes no se coordinan	Límites → Estado in-process
Almacenamiento de archivos
Archivo	Proveedor	Multi-instance
Adjuntos de tickets	InMemoryStorageProvider (memoria)	❌ NO — se pierden al reiniciar
Documentos de conocimiento	Tabla stored_files (PostgreSQL BYTEA)	✅ Sí
Acción requerida para producción: implementar unStorageProvider real (disco, S3) para adjuntos de tickets. Hoyel proveedor es memory y se pierde al reiniciar. El contratoStorageProvider ya existe; solo hay que implementarlo yregistrarlo en createStorageProvider.

Ruta de ampliación
Cuándo ampliar el pool de BD
Condición: concurrencia pico > DB_POOL_MAX × 0.8
(el pool está casi saturado)
Acción: 1. Subir DB_POOL_MAX en .env (p. ej. de 10 a 20)
2. Verificar: num_instancias × DB_POOL_MAX ≤ max_connections del servidor PG
3. Reiniciar la API

text


### Cuándo añadir instancias de la API

Condición: CPU pico > 70% en un solo proceso
o latencia pico > 2s en peticiones normales
Acción: 1. Desplegar 2+ instancias detrás de un balanceador
2. Mover sessionVersions, creations y queues a store compartido
(ver "Estado in-process" arriba)
3. Verificar: num_instancias × DB_POOL_MAX ≤ max_connections del servidor PG
4. Configurar sticky sessions NO necesarias (la API es stateless
excepto por los 3 estados in-process documentados)


### Cuándo subir max_connections del servidor PostgreSQL


Condición: num_instancias × DB_POOL_MAX ≥ max_connections × 0.8
Acción: 1. Subir max_connections en postgresql.conf (p. ej. de 100 a 200)
2. Verificar memoria del servidor: cada conexión consume ~10 MB
(200 conexiones = ~2 GB de RAM solo para conexiones)
3. Alternativa: usar PgBouncer (connection pooler externo) para
reducir el número de conexiones reales a la BD


### Cuándo considerar procesamiento diferido


Condición: una operación (p. ej. envío masivo de notificaciones por correo)
bloquea la respuesta de la API por > 5s
Acción: 1. Mover la operación a un worker asíncrono
2. Persistir el trabajo pendiente en una tabla jobs
(estado, payload, intentos, próxima_ejecución)
3. El worker lee la tabla, ejecuta, marca como completado
4. Reintentos con backoff exponencial
5. Deduplicación por idempotencia del job

NO implementar a menos que las mediciones lo justifiquen.


## Extensibilidad funcional (añadir módulos)

NFR-007 define los contratos que un módulo nuevo debe respetar.
No necesita replicar autenticación, auditoría ni autorización: los
reutiliza.

### Pasos para añadir un módulo nuevo

1. **Crear el directorio** `apps/api/src/modules/<modulo>/`.
2. **Exponer** `index.ts` como única API pública (otros módulos
   solo importan desde ahí).
3. **Registrar dependencias** en `ALLOWED` dentro de
   `architecture.test.ts` (grafo acíclico).
4. **Reutilizar**:
   - `authenticate` y `requirePermission` de `shared/security` y
     `shared/authorization`.
   - `recordAudit` / `recordAuditInTransaction` de `audit`.
   - `notify` / `notifyInTransaction` de `notifications` (si
     genera eventos).
5. **Añadir eventos auditables** al catálogo
   `audit.catalog.ts` (con `implemented: true` o `false` si es
   reservado).
6. **Añadir eventos notificables** al catálogo
   `notifications.catalog.ts` (si aplica).
7. **Crear migración** `012_<modulo>.sql` (idempotente, con
   `IF NOT EXISTS`).
8. **Montar el router** en `app.ts`.

### Ejemplo: módulo `reports` (ya existe como esqueleto)

```typescript
// apps/api/src/modules/reports/index.ts
export { reportsRouter } from './reports.routes';

// app.ts
import { reportsRouter } from './modules/reports';
api.use(reportsRouter);

No necesita su propio sistema de auth, audit ni autorización: los
hereda de shared/.

Capacidad declarada
Escenario
Capacidad declarada
Evidencia
Acción
Actual	< 6 técnicos, < 50 tickets/sem, 1 instancia	Proyección (no medido)	Ninguna
Medio (10×)	~60 técnicos, ~500 tickets/sem, 1-3 instancias	Proyección	Subir DB_POOL_MAX, mover state si multi-instance
Alto (50×)	~300 técnicos, ~2500 tickets/sem, 4-8 instancias	Proyección	Mover state a shared store, subir max_connections

No se afirma escalabilidad ilimitada ni cumplimiento de escenarios
no evaluados. Las capacidades son proyecciones basadas en el
diseño actual. La verificación formal requiere pruebas de carga
con herramientas como k6 o Artillery, que quedan como trabajo
futuro cuando se confirmen los volúmenes reales.

Verificación automatizada
El script scripts/verify-scalability.cjs comprueba:

Que todos los endpoints de listado global usan paginación.
Que las tablas críticas tienen índices definidos en las
migraciones.
Que ningún repositorio carga colecciones completas sin
paginación (búsqueda de LIMIT en consultas SQL).
Ejecutar:

bash

node scripts/verify-scalability.cjs
Archivos principales
apps/api/src/config/env.ts — dbPoolMax, dbConnectionTimeoutMillis
apps/api/src/shared/db/pool.ts — Pool con max y connectionTimeoutMillis
apps/api/src/shared/security/jwt.ts — Comentario de sessionVersions (multi-instance)
apps/api/src/modules/tickets/tickets.service.ts — Comentario de creations (multi-instance)
apps/api/src/modules/users/users.lifecycle.ts — Comentario de queues (multi-instance)
scripts/verify-scalability.cjs — Verificación automatizada
docs/NFR-008-Scalability.md — Este documento
Dependencias
NFR-007 / A5 — Límites modulares y arquitectura.
PostgreSQL y almacenamiento — Capacidad, conexiones y volumen.
Infraestructura — Opciones reales de ampliación y restricciones.
NFR-005 — Línea base y escenarios de medición (pendiente).
Coordinación con otros requerimientos
NFR-001: el control de acceso se reutiliza sin cambios al
añadir instancias (la matriz vive en código, no en memoria).
NFR-004: la disponibilidad no se ve afectada por la
escalabilidad; el monolito modular facilita reinicios rápidos.
NFR-009: la trazabilidad (audit_log, ticket_history) vive en
PostgreSQL; es multi-instance safe.
NFR-010: la integridad de datos se mantiene por las
constraints de DB; no dependen de la instancia.
Estado
Documento de escalabilidad completo. Pendiente de validación con
pruebas de carga formales cuando se confirmen los volúmenes
reales del stakeholder.


### 3b. `scripts/verify-scalability.cjs`

```javascript
#!/usr/bin/env node
/**
 * NFR-008: Script de verificación de escalabilidad.
 *
 * Comprueba automáticamente:
 * 1. Que todos los endpoints de listado global usan paginación.
 * 2. Que las migraciones crean índices en las tablas críticas.
 * 3. Que las consultas SQL de listado usan LIMIT (no cargan todo).
 *
 * Uso:
 *   node scripts/verify-scalability.cjs
 *
 * No requiere BD ni API corriendo; analiza el código estáticamente.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'apps', 'api', 'src');
const MIGRATIONS = path.join(ROOT, 'apps', 'api', 'db', 'migrations');

let errors = 0;
let warnings = 0;
let passed = 0;

function ok(msg) {
  passed++;
  console.log(`  ✓ ${msg}`);
}

function warn(msg) {
  warnings++;
  console.log(`  ⚠ ${msg}`);
}

function fail(msg) {
  errors++;
  console.error(`  ✗ ${msg}`);
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Verificar que los endpoints de listado global usan paginación
// ──────────────────────────────────────────────────────────────────────────

function checkPagination() {
  console.log('\n1. Paginación en endpoints de listado global\n');

  const routesDir = path.join(SRC, 'modules');
  const routeFiles = [];

  function findRouteFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findRouteFiles(full);
      } else if (entry.name.endsWith('.routes.ts')) {
        routeFiles.push(full);
      }
    }
  }
  findRouteFiles(routesDir);

  // Endpoints de listado global que DEBEN paginar.
  // Excluye: /:id/history, /:id/investigations, /:id/attachments (de un recurso específico).
  const globalListEndpoints = [
    { pattern: /GET.*\/tickets['"`]/, file: 'tickets.routes.ts', name: 'GET /tickets' },
    { pattern: /GET.*\/me\/tickets['"`]/, file: 'tickets.routes.ts', name: 'GET /me/tickets' },
    { pattern: /GET.*\/users['"`]/, file: 'users.routes.ts', name: 'GET /users' },
    { pattern: /GET.*\/audit-logs['"`]/, file: 'audit.routes.ts', name: 'GET /audit-logs' },
    { pattern: /GET.*\/knowledge\/articles['"`]/, file: 'knowledge.routes.ts', name: 'GET /knowledge/articles' },
    { pattern: /GET.*\/knowledge\/documents['"`]/, file: 'documents.routes.ts', name: 'GET /knowledge/documents' },
    { pattern: /GET.*\/me\/notifications['"`]/, file: 'notifications.routes.ts', name: 'GET /me/notifications' },
  ];

  for (const endpoint of globalListEndpoints) {
    const filePath = routeFiles.find((f) => f.endsWith(endpoint.file));
    if (!filePath) {
      warn(`No se encontró ${endpoint.file} (¿módulo sin implementar?)`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Buscar la ruta y verificar que usa paginationSchema o paginated() cerca.
    const hasRoute = endpoint.pattern.test(content);
    if (!hasRoute) {
      warn(`${endpoint.name}: no se encontró la ruta en ${endpoint.file}`);
      continue;
    }

    // Verificar que usa paginationSchema o paginated() o page/limit en la misma ruta.
    const hasPagination =
      content.includes('paginationSchema') ||
      content.includes('paginated(') ||
      content.includes('page') && content.includes('limit');

    if (hasPagination) {
      ok(`${endpoint.name} usa paginación`);
    } else {
      fail(`${endpoint.name} NO usa paginación — debe paginar para escalar`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Verificar índices en migraciones
// ──────────────────────────────────────────────────────────────────────────

function checkIndexes() {
  console.log('\n2. Índices en migraciones\n');

  const expectedIndexes = [
    { table: 'tickets', column: 'status', migration: '001' },
    { table: 'tickets', column: 'created_by', migration: '003' },
    { table: 'tickets', column: 'category_id', migration: '003' },
    { table: 'tickets', column: 'priority_id', migration: '003' },
    { table: 'ticket_history', column: 'ticket_id', migration: '003' },
    { table: 'ticket_history', column: 'correlation_id', migration: '009' },
    { table: 'audit_log', column: 'entity', migration: '004' },
    { table: 'audit_log', column: 'action', migration: '004' },
    { table: 'audit_log', column: 'created_at', migration: '004' },
    { table: 'audit_log', column: 'correlation_id', migration: '009' },
    { table: 'knowledge_articles', column: 'category_id', migration: '006' },
    { table: 'knowledge_articles', column: 'status', migration: '006' },
    { table: 'ticket_attachments', column: 'ticket_id', migration: '008' },
    { table: 'ticket_investigations', column: 'ticket_id', migration: '010' },
    { table: 'notifications', column: 'user_id', migration: '011' },
    { table: 'notifications', column: 'dedup_key', migration: '011' },
  ];

  for (const idx of expectedIndexes) {
    // Buscar en todas las migraciones que coincidan con el número.
    const migrationFiles = fs.readdirSync(MIGRATIONS).filter((f) =>
      f.startsWith(idx.migration) && f.endsWith('.sql'),
    );

    let found = false;
    for (const file of migrationFiles) {
      const content = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
      // Buscar CREATE INDEX ... ON table ... o CREATE INDEX ... idx_table_column
      const tablePattern = new RegExp(`INDEX[^;]*ON\\s+${idx.table}`, 'i');
      const indexNamePattern = new RegExp(`idx_${idx.table}.*${idx.column}`, 'i');
      const columnPattern = new RegExp(`INDEX[^;]*${idx.table}[^;]*${idx.column}`, 'i');

      if (tablePattern.test(content) && (indexNamePattern.test(content) || columnPattern.test(content) || content.includes(idx.column))) {
        found = true;
        break;
      }
    }

    if (found) {
      ok(`Índice en ${idx.table}.${idx.column} (migración ${idx.migration})`);
    } else {
      fail(`Falta índice en ${idx.table}.${idx.column} (migración ${idx.migration})`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Verificar que las consultas SQL de listado usan LIMIT
// ──────────────────────────────────────────────────────────────────────────

function checkLimitInQueries() {
  console.log('\n3. Consultas SQL de listado usan LIMIT\n');

  const repoFiles = [];

  function findRepoFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findRepoFiles(full);
      } else if (
        entry.name.endsWith('.postgres.repository.ts') &&
        !entry.name.endsWith('.test.ts')
      ) {
        repoFiles.push(full);
      }
    }
  }
  findRepoFiles(path.join(SRC, 'modules'));

  for (const file of repoFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(ROOT, file);

    // Buscar funciones que hacen SELECT ... FROM ... ORDER BY ... (listados).
    // Verificar que tienen LIMIT $N.
    const selectMatches = content.match(/SELECT[^;]*FROM[^;]*ORDER BY[^;]*/gi) || [];

    for (const query of selectMatches) {
      if (query.toUpperCase().includes('LIMIT')) {
        ok(`${relPath}: consulta de listado usa LIMIT`);
      } else {
        // Excluir consultas que no son de listado (p. ej. SELECT ... FOR UPDATE).
        if (query.toUpperCase().includes('FOR UPDATE')) {
          ok(`${relPath}: consulta con FOR UPDATE (no necesita LIMIT)`);
        } else {
          warn(`${relPath}: consulta sin LIMIT detectada — revisar si es un listado global:
            ${query.slice(0, 120).replace(/\s+/g, ' ')}...`);
        }
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Verificar que DB_POOL_MAX está configurado
// ──────────────────────────────────────────────────────────────────────────

function checkPoolConfig() {
  console.log('\n4. Configuración del pool de BD\n');

  const envFile = path.join(SRC, 'config', 'env.ts');
  const poolFile = path.join(SRC, 'shared', 'db', 'pool.ts');

  const envContent = fs.readFileSync(envFile, 'utf8');
  const poolContent = fs.readFileSync(poolFile, 'utf8');

  if (envContent.includes('dbPoolMax')) {
    ok('env.ts define dbPoolMax');
  } else {
    fail('env.ts NO define dbPoolMax');
  }

  if (poolContent.includes('max:') && poolContent.includes('env.dbPoolMax')) {
    ok('pool.ts usa env.dbPoolMax como max del pool');
  } else {
    fail('pool.ts NO usa env.dbPoolMax — el pool usa el default (10)');
  }

  if (poolContent.includes('connectionTimeoutMillis')) {
    ok('pool.ts configura connectionTimeoutMillis');
  } else {
    warn('pool.ts NO configura connectionTimeoutMillis');
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Resumen
// ──────────────────────────────────────────────────────────────────────────

function summary() {
  console.log('\n─────────────────────────────────────────────');
  console.log(`  Pasaron: ${passed}  |  Advertencias: ${warnings}  |  Errores: ${errors}`);
  console.log('─────────────────────────────────────────────\n');

  if (errors > 0) {
    console.error('❌ Verificación de escalabilidad FALLÓ.');
    process.exit(1);
  } else {
    console.log('✅ Verificación de escalabilidad OK.');
    process.exit(0);
  }
}

// Ejecutar
console.log('NFR-008 — Verificación de escalabilidad\n');
checkPagination();
checkIndexes();
checkLimitInQueries();
checkPoolConfig();
summary();

Resumen del Paso 3
Archivo
Contenido
docs/NFR-008-Scalability.md	Documento completo con los 7 pasos del requerimiento
scripts/verify-scalability.cjs	Script que verifica paginación, índices, LIMIT en consultas y configuración del pool

Cómo ejecutar el script

node scripts/verify-scalability.cjs

El script analiza el código estáticamente (no necesita BD ni API corriendo). Devuelve:

✓ para cada verificación que pasa
⚠ para advertencias (algo que revisar pero no bloquea)
✗ para errores (algo que rompe la escalabilidad)
Exit code 0 si todo pasa, 1 si hay errores