# ADR 0003 — Verificación de identidad manual con proveedor enchufable

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve provisoriamente:** P-02 y C-02 del plan

**Decisión.** Hasta contratar un proveedor KYC, la verificación de clientes y profesionales la hace el admin a mano (`IDENTITY_PROVIDER=manual`), sin almacenar imágenes de DNI ni selfies. La arquitectura admite un proveedor externo mediante la interfaz `IdentityVerificationProvider`.

**Implementación de referencia.** `docs/referencia/verificacion-identidad/` contiene el módulo ya escrito y probado (18 tests contra PostgreSQL 16). Integrarlo en la etapa de perfiles (no antes de los guards de autenticación), adaptándolo a las convenciones reales del repo.

**Integración (etapa 7.1).** Portado a `src/identity-verification/` y `src/integrations/identity/`. Además de lo que hacía la referencia: exige email verificado y foto de perfil para iniciar y para aprobar (ADR 0006), muestra al admin nombre, email, teléfono y foto de la persona, y al revocar cierra sus sesiones.

**Pendiente.** Elegir proveedor y revisión legal del consentimiento (datos biométricos, Ley 25.326) antes de activar un proveedor real.
