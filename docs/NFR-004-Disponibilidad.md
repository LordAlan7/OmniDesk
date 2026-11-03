# NFR-004 — Disponibilidad y Fiabilidad del Sistema

Este documento define los objetivos operativos y los procedimientos de contingencia para OmniDesk, cumpliendo con los criterios de aceptación exigidos.

## 1. Objetivos Operativos (Acordados)

| Parámetro | Definición |
| :--- | :--- |
| **Periodo Operativo** | Lunes a Viernes, de 08:00 a 18:00 (Hora de México, GMT-6). |
| **Objetivo de Disponibilidad** | 99.5% de tiempo activo durante el periodo operativo. |
| **RTO (Recovery Time Objective)** | 2 horas. Tiempo máximo para restablecer el servicio tras una caída. |
| **RPO (Recovery Point Objective)** | 5 minutos. Pérdida máxima de datos tolerada. |
| **Criterio de Indisponibilidad** | Fallo en la API (HTTP 5xx sostenido) o caída de la base de datos que impida login o creación de tickets. |
| **Mantenimiento** | Domingos de 02:00 a 04:00. Se notificará con 24h de anticipación. |

## 2. Manejo de Fallos y Resiliencia

El sistema está diseñado para aislar fallos en servicios no críticos (como IA o Notificaciones).

- **Indisponibilidad de IA:** Si el proveedor de IA (OpenAI) falla, el endpoint de creación de tickets manuales (`POST /api/v1/tickets`) sigue funcionando. La UI debe mostrar un aviso amigable.
- **Fallos de Notificación:** Si el envío de notificaciones falla (por ejemplo, timeout en el servicio), el guardado del ticket en la base de datos **se completa exitosamente**. El requerimiento exige no revertir información ya guardada por un fallo de notificación.
- **Base de Datos:** Si PostgreSQL (Neon) no responde, la API devuelve HTTP 503 en el *Health Check* y rechaza escrituras para no crear estados falsos.

## 3. Persistencia y Confirmación

- Todos los guardados críticos se realizan en PostgreSQL, nunca en memoria o disco temporal.
- Las operaciones compuestas (crear ticket + historial + auditoría) se realizan mediante transacciones SQL. Si algo falla, hay un `ROLLBACK` para evitar registros parciales.

## 4. Respaldos y Recuperación

| Componente | Estrategia de Respaldo |
| :--- | :--- |
| **Base de Datos (PostgreSQL)** | Respaldos automáticos diarios mediante el servicio administrado (Neon). Point-in-time recovery (PITR) habilitado hasta 7 días. |
| **Almacenamiento de Archivos** | [Pendiente de integración - Se usará almacenamiento de objetos persistente (S3/Vercel Blob)]. |

**Procedimiento de Restauración (RTO < 2h):**
1. Identificar el punto de fallo (logs de Vercel o Neon).
2. Si la base de datos se corrompe, crear una nueva rama en Neon restaurando el punto anterior (PITR).
3. Actualizar la variable de entorno `DATABASE_URL` en Vercel con la nueva cadena de conexión.
4. Redesplegar la API (Rollback a la versión anterior si fue un mal despliegue de código).
5. Verificar el endpoint `/api/v1/health` para confirmar conexión a BD.

## 5. Despliegue y Reversión (Rollback)

- **Frontend y API:** Desplegados en Vercel. En caso de fallo, se puede hacer "Instant Rollback" desde el dashboard de Vercel a un despliegue anterior en menos de 1 minuto.
- **Migraciones:** Si una migración SQL falla o rompe el sistema, se debe restaurar el respaldo de la base de datos al punto previo (ya que las migraciones DDL no siempre son reversibles).

## 6. Monitoreo

- **Health Check:** Disponible en `GET /api/v1/health`. Retorna `200 OK` si la API y la base de datos están arriba; `503 Service Unavailable` si hay fallo.
- **Logs:** Utilizamos los logs de Vercel y de Neon para identificar errores en tiempo real.

## 7. Pruebas y Verificación

Se verificó que:
- Reiniciar el servidor de Node no pierde datos guardados en PostgreSQL.
- Una falla en la API de IA no bloquea el registro manual.
- El endpoint `/health` identifica correctamente el estado de la base de datos.