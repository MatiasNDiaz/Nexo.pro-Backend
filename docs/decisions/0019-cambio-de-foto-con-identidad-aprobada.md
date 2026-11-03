# ADR 0019 — Cambio de foto con la identidad ya aprobada

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Se implementa en:** etapa 7.2

**Contexto.** La foto de perfil es la que el admin compara con la persona al verificar su identidad
(ADR 0003 y 0006). Si se pudiera cambiar libremente después de la aprobación, cualquiera podría
mostrar la cara de otra persona con la insignia de identidad verificada.

**Decisión.**

1. Con la identidad aprobada, el usuario **puede** cambiar la foto, pero la verificación **vuelve a
   revisión del admin** (`REQUIRES_REVIEW`).
2. Mientras tanto la **cuenta sigue activa** y el **perfil sigue visible con la foto anterior**. La
   foto nueva queda pendiente y no se muestra en público.
3. Si el admin **aprueba**, la foto nueva reemplaza a la anterior (que se borra del almacenamiento) y
   la identidad vuelve a `APPROVED`.
4. Si el admin **rechaza**, queda la foto anterior, la nueva se borra y la identidad vuelve a
   `APPROVED`. Rechazar la foto no es rechazar la identidad.

**Consecuencias.**

- `users.pending_avatar_file_id`: la foto en revisión.
- `identity_verifications.kind`: `IDENTITY` (verificación inicial) o `AVATAR_CHANGE` (revisión de
  foto). Las revisiones de foto no cuentan para el máximo de intentos.
- Si sube otra foto mientras hay una en revisión, reemplaza a la pendiente y se reutiliza la misma
  revisión.
- Para la visibilidad del perfil y la restauración de cuentas, "identidad aprobada" incluye la
  revisión de una foto nueva.
- Antes de la primera aprobación (cuenta `PENDING_VERIFICATION`) la foto se cambia libremente, como en
  la etapa 7.1.

**Actualización (ADR 0021).** La revisión ahora se llama `PROFILE_CHANGE` y cubre también el cambio de nombre: una sola revisión abierta por persona; aprobarla aplica todo lo pendiente y rechazarla lo descarta.
