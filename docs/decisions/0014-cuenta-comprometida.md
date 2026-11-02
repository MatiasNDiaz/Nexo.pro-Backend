# ADR 0014 — Cuenta comprometida

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** C-25

**Decisión.** Una cuenta comprometida se **recupera** (no se crea otra con los días de plan restantes):

1. El admin verifica la identidad del dueño por un canal propio.
2. `POST /api/v1/admin/users/:id/revoke-sessions` (motivo obligatorio): cierra todos los dispositivos.
3. `POST /api/v1/admin/users/:id/password-reset`: el dueño recibe en su email un enlace de un solo uso
   para elegir una contraseña nueva (ADR 0002), que vuelve a cerrar todas las sesiones.

Las dos acciones quedan auditadas. Si el atacante cambió el email de la cuenta, hace falta el cambio
de email (pendiente) o intervención manual.
