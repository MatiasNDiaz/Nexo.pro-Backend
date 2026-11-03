# ADR 0021 — Edición de datos personales

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Amplía:** ADR 0019

**Decisión.**

1. El cliente y el profesional pueden editar sus datos personales y de perfil.
2. **Teléfono y demás datos** (barrio del cliente, datos del perfil): cambio libre e inmediato.
3. **Nombre y apellido:** si la identidad ya está aprobada, el cambio **queda pendiente y pasa a
   revisión del admin**, igual que la foto (ADR 0019). En público se ve el nombre anterior hasta que
   el admin lo apruebe; si lo rechaza, queda el anterior. Antes de la primera aprobación se cambia
   directamente.
4. **El admin puede modificar los datos de cualquier cliente o profesional**, con motivo y
   auditoría. Su cambio se aplica directamente (no pasa por revisión) y reemplaza un cambio de nombre
   pendiente. No aplica a cuentas de admin.
5. El email no se edita todavía (pendiente: confirmación al nuevo y aviso al viejo).

**Consecuencias.**

- `users.pending_first_name` y `users.pending_last_name` (los dos o ninguno).
- La revisión de la ADR 0019 pasa a llamarse `PROFILE_CHANGE`: **una sola revisión abierta** por
  persona cubre la foto y el nombre pendientes. Aprobarla aplica todo lo pendiente; rechazarla
  descarta todo lo pendiente. La identidad sigue aprobada en los dos casos.
- La auditoría guarda qué campos cambió el admin, no sus valores (son datos personales).
