# ADR 0023 — Cuentas con Google: contraseña opcional, sesión reciente y desvinculación

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Completa:** ADR 0015

**Decisión.**

1. Dependencia: **`openid-client` 6.8.8** (OpenID Connect con PKCE, `state` y `nonce`). Hasta tener
   las credenciales de Google Cloud se usa un **adaptador simulado** (`GOOGLE_PROVIDER=fake`),
   prohibido en producción.
2. Una cuenta creada con Google puede **no tener contraseña** (`users.password_hash` opcional). El
   admin siempre tiene contraseña (constraint en la base).
3. Una cuenta sin contraseña puede **crear una contraseña** y **darse de baja** solo con un inicio de
   sesión de hace **menos de 10 minutos** (si alguien roba una sesión vieja, no puede tomar ni borrar
   la cuenta).
4. **Desvincular Google** solo si la cuenta tiene contraseña, para que nadie quede sin forma de entrar.

**Consecuencias.** Tablas `auth_identities` (una cuenta de Google por usuario y un usuario por cuenta
de Google) y `oauth_pending_requests` (vinculación o registro a medio terminar, 30 minutos). Cookies
de vida corta con path `/api/v1/auth/google`. Eventos auditados: `GOOGLE_LINKED`, `GOOGLE_UNLINKED`,
`USER_REGISTERED` (con `via: GOOGLE`), `PASSWORD_SET`.
