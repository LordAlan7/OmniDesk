# Contrato de integración: Soporte Técnico ↔ API de Inventario
 
**Versión:** 1.1
**Consumidor:** backend de Soporte Técnico (`support-backend`)
**Proveedor:** API de Inventario (NestJS + Prisma)
**Acceso:** solo lectura (GET)
 
## 1. Propiedad de datos
 
| Dato | Dueño | Soporte puede |
|---|---|---|
| Motocicletas (VIN, estado, ubicación) | Inventario | Consultar |
| Refacciones y existencias | Inventario | Consultar |
| Modelos y compatibilidad | Inventario | Consultar |
| Garantías y reclamos | Inventario | Consultar |
| Datos de clientes (nombre, teléfono) | Inventario | Nada: Soporte no los recibe |
| Tickets, IA, conocimiento | Soporte | Todo |
 
Soporte solo guarda una copia mínima del VIN, marca, modelo y año en el ticket (paso 6 del plan).
 
## 2. Autenticación
 
- Esquema: `Authorization: Device <INVENTORY_API_CREDENTIAL>`
- Dispositivo: `support-backend`
- Scopes: `VEHICLE_READ`, `PRODUCT_READ`, `WARRANTY_READ`, `VEHICLE_MODEL_READ`
- **Scope prohibido para Soporte:** `CUSTOMER_DATA_READ`. Este scope es el único que habilita `customerName` y `customerPhone` en Inventario. El dispositivo `support-backend` nunca debe tenerlo.
- Expiración: 90 días, rotación manual
- La credencial vive solo en variables de entorno del backend. Nunca llega al navegador ni a los logs.
## 3. Endpoints
 
| # | Inventario | Soporte (`/inventory/...`) | Scope en inventario |
|---|---|---|---|
| 1 | `GET /vehicles/by-vin/:vin` | `/vehicles/by-vin/:vin` | `VEHICLE_READ` |
| 2 | `GET /vehicles/:id` | `/vehicles/:id` | `VEHICLE_READ` |
| 3 | `GET /vehicles/:id/events` | `/vehicles/:id/events` | `VEHICLE_READ` |
| 4 | `GET /vehicles/:id/warranty` | `/vehicles/:id/warranty` | `WARRANTY_READ` |
| 5 | `GET /vehicles/:id/compatible-products` | `/vehicles/:id/compatible-products` | `VEHICLE_READ`, `PRODUCT_READ` |
| 6 | `GET /products` | `/products` | `PRODUCT_READ` |
| 7 | `GET /products/by-code/:value` | `/products/by-code/:value` | `PRODUCT_READ` |
| 8 | `GET /products/:id` | `/products/:id` | `PRODUCT_READ` |
| 9 | `GET /products/:id/stock` | `/products/:id/stock` | `PRODUCT_READ` |
| 10 | `GET /vehicle-models` | `/vehicle-models` | `VEHICLE_MODEL_READ` |
| 11 | `GET /vehicle-models/:id` | `/vehicle-models/:id` | `VEHICLE_MODEL_READ` |
| 12 | `GET /health` | interno (healthcheck) | Público |
 
Fuera de alcance: movimientos, traspasos, importaciones, dispositivos, auditoría, reglas de escaneo, escaneos, usuarios, dashboard, escrituras de ubicaciones y todo POST/PUT/PATCH/DELETE.
 
Filtros de `GET /products`: `search`, `brand`, `categoryId`, `page`, `limit`.
 
## 4. Campos
 
### Vehicle
Expuestos: `id`, `vin`, `brand`, `model`, `modelId`, `year`, `status` (IN_STOCK | RESERVED | SOLD | RETURNED), `location {id, name}`
Ocultos: `price`, datos de venta, `customerName` y `customerPhone` (solo con `CUSTOMER_DATA_READ`; Soporte no lo tiene), notas internas, `createdBy`
 
### VehicleEvent
Expuestos: `id`, `type` (ENTRY | SALE | RETURN | TRANSFER | WARRANTY_CLAIM), `createdAt`, `location {id, name}`
Ocultos: `userId`, `deviceId`, `metadata`, montos
 
### Warranty
Expuestos: `status`, `startsAt`, `endsAt`, `claims[] {id, status, createdAt, resolvedAt}`
Ocultos: `customerName` y `customerPhone` (solo con `CUSTOMER_DATA_READ`; Soporte no lo tiene), notas de resolución, `resolvedBy`, montos
 
### Product
Expuestos: `id`, `sku`, `name`, `brand`, `category {id, name}`, `status`, `codes[]`
Ocultos: `price`, códigos internos de escaneo, `createdAt`, `updatedAt`
 
### CompatibleProduct
Expuestos: campos de Product + `stockTotal`, `stockLevel`
Ocultos: `price`
 
### Stock
Expuestos: `location {id, name, type}`, `quantity`, `level` (AVAILABLE | LOW | OUT), `total`
Ocultos: umbrales de alerta, movimientos
 
### VehicleModel
Expuestos: `id`, `brand`, `model`, `status`
Ocultos: `createdAt`, `updatedAt`
 
### Reglas
- `price` está oculto por defecto. Solo se muestra con el permiso `INVENTORY_PRICES` y nunca entra al contexto de la IA.
- Los datos de cliente no viajan a Soporte: Inventario no los envía a un dispositivo sin `CUSTOMER_DATA_READ`, y el adaptador de Soporte descarta cualquier campo que no esté en este contrato.
- `level` lo calcula el adaptador de soporte: `OUT` si `quantity = 0`, `LOW` si `quantity < INVENTORY_LOW_STOCK_THRESHOLD`, `AVAILABLE` en otro caso.
- Los esquemas de events y warranty se confirman contra la respuesta real al implementar el adaptador (paso 3).
## 5. Permisos en Soporte
 
| Permiso | Da acceso a |
|---|---|
| `INVENTORY_READ` | Rutas `/inventory/*` |
| `INVENTORY_PRICES` | Campo `price` |
| `AI_CONTEXT_INVENTORY` | Uso de inventario como contexto de la IA |
 
| Rol | `INVENTORY_READ` | `INVENTORY_PRICES` | `AI_CONTEXT_INVENTORY` |
|---|---|---|---|
| Technician | Sí | No | Sí |
| Service Advisor | Sí | Sí | Sí |
| Employee | No | No | No |
| Admin | Sí | Sí | Sí |
 
Poder consultar la IA no implica `AI_CONTEXT_INVENTORY`.
 
## 6. Formato de respuesta
 
| Caso | Inventario devuelve |
|---|---|
| Éxito | `{ "success": true, "data": ... }` |
| Lista | `{ "data": [...], "meta": { page, limit, total, totalPages } }` |
| Error | `{ statusCode, code, message, details, requestId }` |
 
Soporte responde a su frontend con `{ data }` o `{ data, meta }`.
 
## 7. Transporte y headers salientes
 
- **HTTPS obligatorio en producción.** Soporte no arranca con `NODE_ENV=production` si `INVENTORY_API_URL` no empieza con `https://`. En desarrollo se permite `http://`.
- **Sin redirecciones.** Soporte no sigue redirecciones de Inventario: cualquier 3xx es un fallo de red (`INVENTORY_UNAVAILABLE`).
| Header | Valor |
|---|---|
| `Authorization` | `Device <INVENTORY_API_CREDENTIAL>` |
| `Accept` | `application/json` |
| `X-Request-Id` | `requestId` de la petición entrante de soporte |
| `X-Caller` | `support-backend` |
 
## 8. Mapeo de errores
 
| Inventario | Soporte | Código |
|---|---|---|
| 400 | 400 | `INVENTORY_BAD_REQUEST` |
| 401 / 403 | 502 | `INVENTORY_AUTH_FAILED` |
| 404 | 404 | `INVENTORY_NOT_FOUND` |
| 429 | 503 | `INVENTORY_RATE_LIMITED` |
| 5xx, timeout, red, redirección | 503 | `INVENTORY_UNAVAILABLE` |
| Respuesta fuera de contrato | 502 | `INVENTORY_CONTRACT_MISMATCH` |
 
Un 401/403 de la credencial de servicio nunca debe cerrar la sesión del usuario en el frontend.
 
Los mensajes de error de Soporte no incluyen el VIN, códigos ni IDs reales de la ruta: se usan etiquetas como `/vehicles/by-vin/:vin`.
 
## 9. Resiliencia, caché y registro
 
| Parámetro | Valor | Variable |
|---|---|---|
| Timeout | 5000 ms | `INVENTORY_TIMEOUT_MS` |
| Reintentos (GET; solo red o 5xx, **nunca 429**) | 1 | `INVENTORY_MAX_RETRIES` |
| Circuito abierto tras | 5 fallos seguidos | `INVENTORY_CIRCUIT_THRESHOLD` |
| Circuito semiabierto tras | 30 s | `INVENTORY_CIRCUIT_RESET_MS` |
| Caché de modelos | 600 s | `INVENTORY_CACHE_MODELS_TTL_S` |
| Caché de compatibilidad | 300 s | `INVENTORY_CACHE_COMPAT_TTL_S` |
| Caché de moto y refacción | 60 s | `INVENTORY_CACHE_ENTITY_TTL_S` |
| Caché de stock | Sin caché | n/a |
| Umbral de stock bajo | 5 | `INVENTORY_LOW_STOCK_THRESHOLD` |
| Log de llamadas salientes | Activo (apagado en pruebas) | `INVENTORY_LOG_CALLS` |
 
**Log de llamadas salientes:** un renglón por intento con ruta etiquetada (sin VIN ni query), estado o `network`, latencia en ms, número de intento y `requestId`. Nunca registra la URL real, la credencial ni el cuerpo.
 
**Límite de peticiones en Inventario:** los dispositivos de servicio se cuentan por dispositivo (default 600 por minuto y por ruta); los usuarios web y las rutas públicas, por IP (default 100 por minuto).
 
## 10. Validación de entrada
 
| Dato | Regla |
|---|---|
| VIN | 17 caracteres alfanuméricos, sin I, O, Q; se normaliza a mayúsculas |
| `limit` | Máximo 50, por defecto 20 |
| `search` | 2 a 80 caracteres |
| IDs | UUID |
 
## 11. Variables de entorno
 
### Soporte
```
INVENTORY_PROVIDER=http            # http | mock
INVENTORY_API_URL=                 # https:// obligatorio en producción
INVENTORY_API_CREDENTIAL=
INVENTORY_TIMEOUT_MS=5000
INVENTORY_MAX_RETRIES=1
INVENTORY_CIRCUIT_THRESHOLD=5
INVENTORY_CIRCUIT_RESET_MS=30000
INVENTORY_CACHE_MODELS_TTL_S=600
INVENTORY_CACHE_COMPAT_TTL_S=300
INVENTORY_CACHE_ENTITY_TTL_S=60
INVENTORY_LOW_STOCK_THRESHOLD=5
INVENTORY_LOG_CALLS=true           # opcional; por defecto activo salvo NODE_ENV=test
```
 
### Inventario
```
CORS_ORIGINS=                      # obligatorio; orígenes exactos separados por coma
THROTTLE_TTL_MS=60000              # ventana del límite
THROTTLE_LIMIT=100                 # por IP (usuarios web y rutas públicas)
THROTTLE_DEVICE_LIMIT=600          # por dispositivo de servicio
```
 
`CORS_ORIGINS` rechaza `*`, comodines dentro de un origen, rutas y `/` final. Cada valor debe ser un origen exacto (`https://host` o `http://host:puerto`).
 
## 12. Cambios requeridos en la API de Inventario
 
### Hechos en el paso 13 (v1.1)
- `CORS_ORIGINS` es obligatoria y se valida: no se acepta `*` ni orígenes que no sean exactos.
- Límite de peticiones por dispositivo (`THROTTLE_*`).
- Nuevo scope `CUSTOMER_DATA_READ`: es el único que habilita `customerName` y `customerPhone` en vehículos y garantías. `WARRANTY_READ` ya no los da.
- `VEHICLE_MODEL_READ` y `CUSTOMER_DATA_READ` se pueden otorgar al aprobar un dispositivo (API y pantalla de dispositivos).
- Migración de datos: los dispositivos que ya veían datos de cliente reciben `CUSTOMER_DATA_READ`, excepto `support-backend`.
### Pendientes de v1.0 (verificar su estado)
- Crear los scopes `WARRANTY_READ` y `VEHICLE_MODEL_READ`.
- Añadir `@RequireScopes` a `GET /products/:id/stock`, `GET /vehicle-models`, `GET /vehicle-models/:id` y `GET /vehicles/:id/warranty`.
- Verificar `@RequireScopes` en `GET /vehicles/by-vin/:vin`, `GET /vehicles/:id/events` y `GET /products`.
- Aceptar `X-Request-Id` y devolverlo como `requestId`.
## 13. Versionado
 
Todo cambio de campos, rutas o errores requiere subir la versión de este documento y avisar al otro equipo.
 
| Versión | Cambios |
|---|---|
| 1.0 | Versión inicial. |
| 1.1 | Scope `CUSTOMER_DATA_READ` y datos de cliente ocultos para Soporte; HTTPS obligatorio en producción y sin redirecciones; el 429 no se reintenta; log de llamadas salientes; límite de peticiones por dispositivo; validación estricta de `CORS_ORIGINS`; mensajes de error sin VIN. |
 