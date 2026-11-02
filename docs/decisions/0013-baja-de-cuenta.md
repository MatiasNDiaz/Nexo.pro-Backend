# ADR 0013 — Baja de cuenta con anonimización

- **Fecha:** 02/11/2026 · **Estado:** aprobada, **sujeta a revisión legal** · **Resuelve:** C-16

**Decisión.** La baja (pedida por el usuario o hecha por el admin) es un soft delete con
**anonimización inmediata** de los datos personales:

- email → `deleted-<id>@deleted.invalid` (queda libre para una cuenta nueva), nombre y apellido →
  "Cuenta eliminada", teléfono y barrio vacíos, contraseña inutilizable, estado `DEACTIVATED`;
- se borran el segundo factor y los enlaces pendientes; se revocan todas las sesiones; el perfil
  profesional queda inactivo;
- se conservan el id (como seudónimo) y lo que lo referencia: auditoría y, en etapas futuras, pagos,
  reportes, sanciones e historial de contrataciones.

La baja propia exige la contraseña; no la pueden pedir cuentas suspendidas o baneadas ni el admin.
La del admin lleva motivo y queda auditada (`ACCOUNT_DELETED`).

**Pendiente de revisión legal (Ley 25.326).** Qué datos se conservan, por cuánto tiempo y con qué base;
qué pasa con reseñas, publicaciones del foro y mensajes del usuario dado de baja (etapas 8 y 10).
Además hay una tensión con "el admin puede restaurar cuentas eliminadas" (C-36 en `pendientes.md`):
con anonimización inmediata no se puede.
