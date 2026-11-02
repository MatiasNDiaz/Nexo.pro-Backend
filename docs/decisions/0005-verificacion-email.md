# ADR 0005 — Verificación de email al registrarse

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** C-31 (nueva, etapa 1)

**Contexto.** El cuestionario dice "principalmente no" a verificar el email, pero la ADR 0002 envía el enlace de recuperación al email registrado: si nunca se verificó, el enlace podría llegar a alguien que no es el dueño.

**Decisión.** Se verifica el email al registrarse con un enlace de un solo uso (24 h), según el plan §9.3.

**Consecuencias.** `users.email_verified_at`; `one_time_tokens` tipo `EMAIL_VERIFY`; `MailProvider` de consola en desarrollo y proveedor real antes de producción.
