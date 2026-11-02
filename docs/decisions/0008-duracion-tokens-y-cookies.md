# ADR 0008 — Duración de tokens y nombres de cookies

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** duraciones del plan §9.2 y P-13 (provisorio)

**Decisión.**

| Parámetro                | Usuario | Admin  |
| ------------------------ | ------- | ------ |
| Access token (JWT)       | 10 min  | 5 min  |
| Refresh por inactividad  | 14 días | 12 h   |
| Vida máxima de la sesión | 30 días | 7 días |
| Verificación de email    | 24 h    | —      |
| Reset de contraseña      | 30 min  | 30 min |

Prefijo de cookies `nx_` (neutro mientras no esté definida la marca): `nx_at`, `nx_rt`, `nx_csrf` en desarrollo; `__Host-nx_at`, `__Secure-nx_rt`, `__Host-nx_csrf` en producción.

**Consecuencias.** Reemplaza el prefijo `ry_` del plan. Valores configurables por entorno y centralizados en `auth.config.ts` (etapa 5).
