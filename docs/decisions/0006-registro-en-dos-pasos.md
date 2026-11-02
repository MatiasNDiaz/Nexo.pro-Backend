# ADR 0006 — Registro en dos pasos y DNI

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** C-33 (nueva, etapa 1)

**Contexto.** El registro exige foto y DNI, pero la subida de archivos llega en la etapa 7 y la autenticación en la 5.

**Decisión.**

1. Paso 1 (etapa 5): la cuenta se crea en `PENDING_VERIFICATION` con nombre, apellido, email, teléfono, contraseña, rol, ubicación (provincia, localidad, barrio) y, si es profesional, su profesión.
2. Paso 2 (etapa 7): "completar perfil" con la foto. El admin solo puede aprobar la verificación de identidad con el perfil completo.
3. **El número de DNI no se guarda** hasta que haya revisión legal (tampoco imágenes, ver ADR 0003).

**Consecuencias.** Las tablas de ubicaciones, profesiones y planes se crean con sus datos iniciales en la etapa 4. `users` no tiene columnas de DNI por ahora; la detección de cuentas duplicadas por DNI queda pendiente.
