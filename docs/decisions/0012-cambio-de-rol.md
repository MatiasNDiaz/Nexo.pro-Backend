# ADR 0012 — Cambio de rol

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** P-12

**Decisión.** Solo el admin cambia el rol, entre CUSTOMER y PROFESSIONAL (nunca a ADMIN), con motivo
obligatorio y auditoría (`ROLE_CHANGED`, con rol de origen y destino). El perfil anterior queda
**inactivo**, no se borra. Se revocan todas las sesiones del usuario.

**Consecuencias.**

- `POST /api/v1/admin/users/:id/change-role`. Pasar a cliente requiere el barrio donde vive (salvo que ya
  lo tuviera); pasar a profesional requiere profesión y zonas, salvo que reactive un perfil anterior.
- `professional_profiles.deactivated_at`. El historial queda en `admin_audit_logs` (no se crea la tabla
  `role_changes` del plan: duplicaría la auditoría).
- Efecto sobre la suscripción del profesional: se define en la etapa 9.
