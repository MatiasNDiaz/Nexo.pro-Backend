# ADR 0015 — Login con Google (OAuth)

- **Fecha:** 02/11/2026 · **Estado:** aprobada, **agendada** como etapa 7B (después de la etapa 7)

**Decisión.**

- Clientes y profesionales pueden registrarse e iniciar sesión con Google. **El admin no** (sigue con
  contraseña + TOTP).
- Si el email de Google coincide con una cuenta existente, **no se vincula sola**: el usuario tiene que
  probar que es el dueño ingresando su contraseña o con un enlace enviado a ese email. Recién ahí se
  vincula.
- Un usuario nuevo de Google completa los **mismos datos obligatorios** (rol, nombre, teléfono, barrio o
  profesión y zonas) y pasa por la **misma verificación de identidad** que el resto. Empieza en
  `PENDING_VERIFICATION`.

**Diseño previsto (plan §9.3).** Authorization code con PKCE y `state` en una cookie `HttpOnly` de vida
corta; solo se acepta un email marcado como verificado por Google; tabla `auth_identities`
(`provider`, `provider_subject` únicos); la sesión que se emite es la misma de siempre (cookies de la
API). `password_hash` pasa a ser opcional para cuentas creadas solo con Google, que podrán definir una
contraseña después.

**Bloquea.** Credenciales OAuth de Google (Google Cloud Console) y las URLs de callback de cada ambiente.
Dependencia nueva a aprobar en esa etapa (estrategia de Passport para Google u OpenID Connect).
