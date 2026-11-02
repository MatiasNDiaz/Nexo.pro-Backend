# ADR 0011 — Política de contraseñas

- **Fecha:** 02/11/2026 · **Estado:** aprobada

**Decisión.** Mínimo **8** caracteres para clientes y profesionales y **12** para el admin; máximo 128.
Sin reglas de composición forzadas (NIST SP 800-63B). No puede ser igual al email. Hash argon2id con
los parámetros mínimos de OWASP (19 MiB, t=2, p=1).

**Pendiente.** Rechazar contraseñas filtradas (p. ej. Have I Been Pwned con k-anonymity) requiere una
llamada externa: queda para decidir.
