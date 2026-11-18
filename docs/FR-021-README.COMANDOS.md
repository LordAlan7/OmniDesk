# FR-021 – Exportaciones y comprobaciones pendientes

## 1. Comprobar exportaciones de TypeScript

Desde la raíz del proyecto:

```powershell
cd "D:\Proyecto Omnidesk\omnidesk"

# Comprobar errores de TypeScript en la API
npm run typecheck -w apps/api

# Comprobar errores de TypeScript en el frontend
npm run type-check -w apps/web
```

## 2. Comprobar compilación

```powershell
# Compilar API
npm run build -w apps/api

# Compilar frontend
npm run build -w apps/web
```

## 3. Comprobar migraciones de FR-021

```powershell
# Ejecutar migración base de cotizaciones
npm run migrate:quotations -w apps/api

# Ejecutar migración del sistema de revisiones
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f ".\apps\api\db\migrations\017_fr021_quotation_reviews.sql"
```

## 4. Comprobaciones funcionales pendientes

- [ ] Generar una cotización mediante IA desde un ticket.
- [ ] Consultar el listado de cotizaciones del ticket.
- [ ] Consultar una cotización por su identificador.
- [ ] Editar conceptos, cantidades y descripciones.
- [ ] Guardar una nueva versión de la cotización.
- [ ] Enviar una cotización a revisión.
- [ ] Aprobar una cotización.
- [ ] Rechazar una cotización indicando el motivo.
- [ ] Solicitar información adicional indicando el motivo.
- [ ] Consultar el historial de revisiones.
- [ ] Verificar que una cotización incompleta no pueda aprobarse.
- [ ] Verificar que únicamente el creador pueda enviar su cotización a revisión.
- [ ] Verificar que los permisos impidan revisiones a usuarios no autorizados.

## 5. Consideraciones

- Las migraciones deben ejecutarse con una conexión válida a PostgreSQL.
- La migración 017 debe existir en `apps/api/db/migrations/`.
- Los precios, impuestos, descuentos y totales continúan como valores pendientes de integración comercial.
- La validación de aprobación debe impedir aprobar cotizaciones incompletas.
- No se deben considerar completadas las comprobaciones hasta ejecutarlas y verificar sus resultados.
