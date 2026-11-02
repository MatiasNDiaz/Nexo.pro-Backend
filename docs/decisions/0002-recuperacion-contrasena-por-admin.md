# ADR 0002 — Recuperación de contraseña por el admin

- **Fecha:** 02/11/2026 · **Estado:** aprobada (puede cambiar a futuro) · **Resuelve:** C-01 del plan

**Decisión.** El admin "blanquea" las credenciales. Implementación segura obligatoria:

- El admin nunca ve ni define la contraseña.
- Tras verificar la identidad del usuario, ejecuta `POST /api/v1/admin/users/:id/password-reset`, que envía al email registrado un enlace de un solo uso (30 min).
- Al usarlo se revocan todas las sesiones del usuario.
- Motivo obligatorio y registro en auditoría.
- El reset autoservicio (`/auth/password/forgot` y `/reset`) queda implementado pero apagado con `PASSWORD_SELF_RESET_ENABLED=false`.
