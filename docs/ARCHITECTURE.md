# Arquitectura (resumen operativo)

Derivada del documento *A5 Software Solution Architecture and Design*.

**Estilo:** Monolito modular + capas + cliente-servidor/API REST. Un solo despliegue, fronteras internas estrictas (NFR-007).

## Grafo de dependencias entre módulos

```
auth ───────► users ───────► audit
tickets ────► users, audit, notifications
files ──────► tickets, audit
knowledge ──► files, audit
ai ─────────► knowledge, tickets, audit
reports ────► tickets
notifications, audit: sin dependencias de otros módulos
```

Todo módulo también puede usar `shared/` (errores, seguridad, helpers HTTP, BD).

## Decisiones tomadas al armar el esqueleto

| Tema | Decisión | Motivo |
|---|---|---|
| `authenticate` / `requireRole` | Viven en `shared/security`, no en `auth/` | Evita el ciclo `auth ⇄ users`. |
| `files` ⇄ `tickets` | `files` depende de `tickets`; `tickets` **no** importa `files` | El documento lista dependencia en ambos sentidos; se rompe el ciclo en una dirección. |
| `ai` + AI Validation | Un solo módulo `ai` | La validación humana (FR-015) es parte del flujo de IA; separar luego si crece. |
| Proveedor de IA | Interfaz `AIProvider` + `MockAIProvider` | Permite cambiar OpenAI por otro servicio sin tocar el resto. |
| Persistencia | Repositorios en memoria con la interfaz final | El equipo avanza en paralelo sin BD; se migra módulo por módulo. |
| Ticket ajeno | Responde `404`, no `403` | No revelar la existencia de tickets de otros. |
| Login fallido | Mensaje genérico | No revelar si el correo existe. |
| Auditoría | Solo `INSERT`/`SELECT`, sin rutas de modificación | NFR-009. |

## Pendientes que dependen de decisiones del cliente (preguntas abiertas del documento)

- Categorías, niveles de prioridad y criterios (P1, P2): `PRIORITIES` y los estados son **provisionales** en `tickets.types.ts`.
- Canal de notificaciones externo (P6): hoy solo notificaciones internas.
- ¿Quién crea tickets? (P11): hoy pueden crear `Employee` y `Service Advisor`.
- Despliegue en Vercel con Express: requiere adaptar a funciones serverless o elegir otro host para el API.
