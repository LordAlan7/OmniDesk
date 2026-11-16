## ¿Qué cambia este PR?
<!-- Descripción breve -->

## Módulo(s) afectado(s)
<!-- auth / users / tickets / files / knowledge / ai / reports / notifications / audit / web -->

## Requisitos relacionados
<!-- Ej: FR-003, FR-005, NFR-009 -->

## Checklist
- [ ] `npm run typecheck` y `npm run test:api` pasan en local
- [ ] No importo archivos internos de otro módulo (solo su `index.ts`)
- [ ] Agregué o actualicé pruebas
- [ ] Las acciones importantes quedan registradas en `audit`
- [ ] No hay secretos ni `.env` en el commit

### Seguridad (NFR-002)
- [ ] Consultas SQL parametrizadas; sin concatenar entrada de usuario
- [ ] Entradas validadas con Zod `.strict()` y permisos verificados en el servidor
- [ ] No uso `v-html` con contenido de usuarios, artículos o IA
- [ ] Respuestas, logs y `audit` no incluyen contraseñas, tokens ni datos sensibles
- [ ] Endpoints nuevos sensibles (login, cargas, IA) tienen límite de solicitudes
