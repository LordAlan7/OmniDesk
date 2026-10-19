# FR-012 — Manuales y documentación técnica

Implementación para la copia de OmniDesk enviada el 16 de octubre de 2026.
Responsable: Mariana Nuñez de la Hoya. Apoyo: Edgar Alan Meráz Casas.

## Alcance implementado

- Biblioteca Vue con carga, búsqueda por metadatos, filtros por categoría/estado y paginación.
- Formulario y detalle: título, descripción, categoría, fuente, referencia de origen, edición y fecha documental opcionales. Se diferencia fuente de usuario de carga.
- PDF hasta 10 MiB (10,485,760 bytes). Se verifica extensión, MIME, firma y estructura. Se rechazan archivos vacíos, inválidos, cifrados y estructuras activas detectadas. El archivo siempre se entrega como descarga protegida, sin visor embebido.
- Archivos en `stored_files.content` (BYTEA de PostgreSQL), accesibles exclusivamente por backend. Metadatos y auditoría comparten transacción con el binario: no hay archivos huérfanos por fallos de inserción.
- Integración en los módulos knowledge, files y audit, usando sus índices públicos. Los artículos documentales se vinculan a `knowledge_articles` y `knowledge_categories`. Los endpoints de artículos FR-011/FR-019 y adjuntos FR-004 conservan sus esqueletos; la nueva biblioteca proporciona categorías compartibles para su futura implementación.
- Publicación, retiro y restricciones por roles. Control de revisión evita sobrescribir cambios concurrentes. Edición únicamente en borrador; Manager puede devolverlo a borrador antes de corregirlo.
- Eventos durables en `audit_log`; historial por documento disponible para usuarios con `audit:read` y acceso al documento.
- Identificador del documento, versión interna UUID y SHA-256 estables. No se sustituye el PDF ni se borra físicamente en esta entrega. La edición indicada por el fabricante es un dato distinto de la versión interna.
- Ninguna carga se autoriza para IA; la base impide cambiar `ai_authorized` a true en este alcance. No incluye OCR, indexación, búsqueda dentro del PDF ni integración de recuperación para IA.

## Política inicial y permisos

Se reutiliza la matriz existente; no se conceden privilegios nuevos a ningún rol.

| Rol | Consultar publicados permitidos | Cargar | Editar borrador propio | Publicar / retirar / definir roles |
| --- | --- | --- | --- | --- |
| Employee | Sí | No | No | No |
| Technician | Sí | Sí | Sí | No |
| Service Advisor | Sí | Sí | Sí | No |
| Manager | Sí, y moderar todos los documentos | Sí | Sí, también de otros autores | Sí |
| Administrator | Sí | No | No | No |

Los permisos de varios roles se combinan como en la matriz actual. Un usuario con `knowledge:publish` puede moderar todos los documentos. Los borradores solo son visibles para su autor y quienes publican; los retirados solo para quienes publican. Un publicado con roles seleccionados solo es visible para esos roles y quienes publican. Sin roles seleccionados, lo consultan todos los usuarios con `knowledge:read`. Los resultados y totales usan la misma regla que detalle y descarga. Un ID conocido no concede acceso: se devuelve 404 para recursos inexistentes o restringidos, 401 para sesiones inválidas y 403 para falta de permiso de operación.

Título, descripción, categoría y fuente son obligatorios. Cuando no pueda confirmarse la procedencia, usar “Fuente no confirmada” y mantener el documento en borrador hasta la revisión. La edición y la fecha pueden quedar vacías; no se inventan valores.

Esta es una política inicial tomada de la matriz y los valores propuestos en la conversación. Mariana, Edgar y Alan deben validar formatos, límites, procedencia, categorías y conservación antes de declarar aceptada la política documental. Los filtros estructurales del PDF no sustituyen un antivirus. No se incorpora un motor antivirus externo. Para más volumen o archivos mayores, files puede cambiar a almacenamiento de objetos manteniendo las reglas de acceso; BYTEA evita por ahora depender del disco temporal del backend. Incluir los binarios en respaldos de PostgreSQL.

## Instalación en Windows

1. Detener el backend y el frontend con Ctrl+C en sus respectivas terminales.
2. Extraer `OmniDesk-FR012-implementacion.zip` a una carpeta nueva. No extraerlo directamente encima del repositorio.
3. Desde PowerShell, ejecutar (ajustar la carpeta si la extracción tiene otro nombre):

```powershell
cd C:\Omnidesk\OmniDesk
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\OmniDesk-FR012-implementacion\Apply-FR012.ps1" -ProjectPath "C:\Omnidesk\OmniDesk"
```

El instalador comprueba los archivos contra la copia enviada. Si alguno cambió, se detiene ANTES de copiar nada; no forzar ni borrar esos cambios, compartir el mensaje para adaptar el parche. También permite ejecutar de nuevo cuando los archivos ya coinciden con el resultado. Crea un respaldo de los archivos sustituidos al lado del repositorio y muestra su ubicación. No ejecuta SQL, instalaciones npm, commits ni pushes.

4. Instalar dependencias. Se omiten scripts de instalación para evitar que se vuelva a descargar Cypress durante este paso; no se necesita Cypress para usar la aplicación:

```powershell
cd C:\Omnidesk\OmniDesk
npm install --ignore-scripts
cd apps\api
npx tsx src/scripts/migrate-documents.ts
npm run typecheck
npm test -- --runInBand
```

El script usa `DATABASE_URL` ya configurado en `apps/api/.env`. No sustituir ni compartir ese archivo. Requiere las tablas de las migraciones existentes 001 y 002, que no modifica ni vuelve a ejecutar. FR-012 añade su propia migración 003 y registra su aplicación; al repetir el script después de una aplicación correcta, no vuelve a crear tablas. Si ya aplicaste manualmente 003 sin el script, no lo ejecutes encima: revisa el estado de la migración antes.

5. Revisar frontend y encender ambos servidores en terminales distintas:

```powershell
# Terminal del backend
cd C:\Omnidesk\OmniDesk\apps\api
npm run dev
```

```powershell
# Terminal del frontend
cd C:\Omnidesk\OmniDesk\apps\web
npm run type-check
npm run dev
```

Abrir `http://localhost:5173/knowledge/documents`. La API usa `http://localhost:3000/api/v1` o el `VITE_API_URL` existente. La navegación añade “Manuales y documentación”; al iniciar sesión, usuarios sin acceso a la lista de cuentas entran a la biblioteca.

## API

Todas las rutas requieren Bearer token. Respuestas JSON `{data}`; listados añaden `{meta:{page,limit,total}}`.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | /api/v1/knowledge/categories | Categorías compartidas |
| GET | /api/v1/knowledge/documents | Listar: search, categoryId, status, page, limit |
| POST | /api/v1/knowledge/documents | multipart/form-data: file y metadatos |
| GET | /api/v1/knowledge/documents/:id | Detalle y procedencia |
| GET | /api/v1/knowledge/documents/:id/content | Descarga PDF con autorización vigente |
| PATCH | /api/v1/knowledge/documents/:id | JSON: metadatos completos y revision actual |
| PATCH | /api/v1/knowledge/documents/:id/publication | JSON: status, accessRoles y revision |
| GET | /api/v1/knowledge/documents/:id/history | Historial persistente; requiere audit:read y acceso al documento |

Metadatos: `title`, `description`, `categoryId`, `source`, `sourceReference` opcional, `edition` opcional y `documentDate` opcional en YYYY-MM-DD. No enviar campos adicionales como fileId o aiAuthorized. El control de publicación admite `draft`, `published`, `retired`; `accessRoles` es un arreglo de nombres de roles existentes. La fecha vacía se omite o envía null. La descarga usa Authorization en encabezado; el token nunca se añade a la URL.

## QA manual

1. Entrar con una cuenta Technician o Service Advisor existente. Cargar un PDF válido con título y fuente distinguibles. Comprobar que aparece como Borrador y que fuente y usuario de carga no se confunden.
2. Buscarlo por título y fuente y filtrar categoría. Abrir detalle, editar en borrador y descargarlo. Verificar errores de campos sin perder metadatos del formulario.
3. Entrar con Employee: el borrador no debe aparecer en resultados ni totales, y conocer su ID no debe permitir leerlo o descargarlo.
4. Entrar como Manager y publicarlo para Technician. Employee debe seguir sin acceso. Publicarlo sin restringir roles: Employee debe poder encontrarlo y descargarlo, pero no editar ni cargar.
5. Como Manager, devolver a borrador antes de editar. Una segunda pestaña con una revisión anterior debe recibir 409 y pedir volver a consultar.
6. Retirarlo como Manager: debe desaparecer para Employee/Technician, incluso usando el ID; Manager conserva acceso para revisión. No se borra el archivo histórico.
7. Intentar archivo vacío, PDF renombrado desde texto, extensión distinta, PDF cifrado y >10 MiB. Deben rechazarse y no aparecer como cargas completas.
8. Reiniciar el backend y comprobar que archivos y metadatos siguen disponibles. Quitar permisos/desactivar una cuenta y comprobar que las nuevas solicitudes pierden acceso.
9. Consultar `/knowledge/documents/:id/history` como Manager y verificar eventos. Technician sin audit:read recibe 403. La ruta general `/audit-logs` conserva el comportamiento previo del proyecto; el historial documental duradero se consulta en la ruta nueva.

## Pruebas automatizadas y validación realizada

- 60 pruebas sin base de datos pasaron (incluyen autorización, validación de PDF, fechas, campos prohibidos y arquitectura, junto con las pruebas previas).
- 8 pruebas de integración documental pasaron usando el motor PostgreSQL embebido PGlite con un adaptador exclusivo del entorno de validación. Comprueban persistencia, permisos de lista/totales/detalle/binario, revisión, retiro y rollback ante fallo de auditoría. El adaptador no se añade al proyecto ni se usa en producción.
- TypeScript del backend y Vue/TypeScript del frontend: sin errores. Bundle de Vue generado con Vite. Se utilizaron configuraciones temporales de validación porque el ZIP de contexto no incluía las configuraciones completas del frontend.
- No se ejecutó la interfaz en un navegador ni Cypress en este entorno. Se entrega `apps/web/cypress/e2e/documents.cy.ts` y un PDF de prueba; validar en tu equipo y guardar capturas como evidencia. Tampoco se verificó una conexión TCP a tu instancia PostgreSQL.

Las pruebas de integración incluidas requieren una base de pruebas separada llamada `omnidesk_test` y usan un esquema temporal que eliminan al terminar:

```powershell
cd C:\Omnidesk\OmniDesk\apps\api
$env:TEST_DATABASE_URL = "postgresql://USUARIO:CONTRASENA@localhost:5432/omnidesk_test"
npm test -- --runInBand documents.postgres.integration.test.ts
Remove-Item Env:TEST_DATABASE_URL
```

Reemplaza los valores localmente y no publiques la contraseña. No apuntar a una base con datos de trabajo. Para Cypress usar una base de desarrollo/pruebas, las cuentas reales de esos roles, ambos servidores encendidos y la configuración E2E existente. El spec usa las cuentas demo del proyecto por defecto; puedes indicar qaTechnician, qaManager, qaEmployee y qaPassword mediante Cypress.env. Si el binario de Cypress no está instalado, instalarlo aparte cuando se vaya a ejecutar la prueba.

## Entrega y Git

Revisar `git diff` y ejecutar las verificaciones en tu computadora antes de hacer commit. No incluir `.env`, respaldos, node_modules ni archivos de base de datos. El cambio del lockfile producido por npm sí debe revisarse y versionarse. QA debe validar la política pendiente y adjuntar las capturas; esta entrega prepara el código y no declara cerrado el requerimiento en Jira.
