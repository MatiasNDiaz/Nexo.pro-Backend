# Autorización

Toda autorización se decide en el backend; ocultar un botón en el frontend no protege nada.

## Guards globales (en este orden)

| #   | Guard               | Qué hace                                                                       | Error                                               |
| --- | ------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| 1   | `ThrottlerGuard`    | Rate limit por IP (global y por ruta)                                          | 429 `TOO_MANY_REQUESTS`                             |
| 2   | `OriginGuard`       | Métodos no seguros: `Origin` en la allowlist + `X-Requested-With`              | 403 `ORIGIN_NOT_ALLOWED` / `MISSING_REQUESTED_WITH` |
| 3   | `JwtAuthGuard`      | Cookie de access + sesión viva + usuario cargado de la base. Salvo `@Public()` | 401 `UNAUTHORIZED` / `ACCESS_TOKEN_EXPIRED`         |
| 4   | `CsrfGuard`         | Métodos no seguros con sesión: `X-CSRF-Token` válido                           | 403 `CSRF_INVALID`                                  |
| 5   | `AccountStateGuard` | Solo `ACTIVE`, salvo `@AllowAccountStates(...)`                                | 403 `ACCOUNT_STATE_NOT_ALLOWED`                     |
| 6   | `RolesGuard`        | `@Roles(...)`                                                                  | 403 `FORBIDDEN`                                     |
| 7   | Suscripción/plan    | Llega en las etapas 7 y 9                                                      | —                                                   |

**Denegación por defecto**: una ruta sin `@Public()` exige sesión; una ruta sin `@AllowAccountStates`
exige cuenta `ACTIVE`.

## Decoradores

| Decorador                            | Uso                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `@Public()`                          | Sin sesión (login, registro, health, catálogos públicos)                                               |
| `@Roles('ADMIN')`                    | Restringe por rol (el rol sale de la base, nunca del cliente)                                          |
| `@AllowAccountStates(...)`           | Habilita estados además de `ACTIVE`                                                                    |
| `@CurrentUser()`                     | Usuario autenticado (`id`, `sid`, `familyId`, `role`, `status`, `verificationStatus`, `emailVerified`) |
| `@SkipOriginCheck()` / `@SkipCsrf()` | Solo webhooks verificados por firma (etapa 7 en adelante)                                              |

## Estados de cuenta

| Estado                 | Puede                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PENDING_VERIFICATION` | Ver su cuenta y sesiones, verificar email, cambiar contraseña, cerrar sesión. Verificar identidad (etapa 7). No opera |
| `ACTIVE`               | Todo lo que su rol permita                                                                                            |
| `SUSPENDED` / `BANNED` | Ver su cuenta (con el motivo en `statusReason`), sus sesiones y cerrar sesión. Apelar (etapa 11) (ADR 0007)           |
| `DEACTIVATED`          | Nada: cuenta dada de baja. Restaurable por el admin durante 30 días; después se anonimiza (ADR 0013 y 0016)           |

### Transiciones (las hace el admin, con motivo y auditoría)

| Acción            | Desde                                                       | Hacia                                                                                     | Revoca sesiones |
| ----------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------- |
| `suspend`         | `ACTIVE`, `PENDING_VERIFICATION`                            | `SUSPENDED`                                                                               | Sí              |
| `ban`             | `ACTIVE`, `PENDING_VERIFICATION`, `SUSPENDED`               | `BANNED`                                                                                  | Sí              |
| `restore`         | `SUSPENDED`, `BANNED`, o `DEACTIVATED` en período de gracia | `ACTIVE` si la identidad está aprobada; si no, `PENDING_VERIFICATION`                     | No              |
| `change-role`     | Cliente ↔ profesional (nunca ADMIN)                         | El otro rol; el perfil anterior queda inactivo                                            | Sí              |
| `revoke-sessions` | Cualquiera                                                  | Sin cambio de estado (cuenta comprometida, ADR 0014)                                      | Sí              |
| `DELETE` (baja)   | Cualquiera salvo ADMIN                                      | `DEACTIVATED` por 30 días (restaurable) y después anonimización (tarea diaria a las 3:00) | Sí              |

Transición inválida → 409 `INVALID_STATE_TRANSITION`. Ninguna se aplica a una cuenta ADMIN
(409 `CANNOT_MODIFY_ADMIN`). Las cuentas activas también pueden darse de baja solas (`DELETE /users/me`,
con contraseña).

## Ownership (recursos propios)

No es un guard: cada servicio filtra por el usuario **en la consulta** y responde **404** (no 403) si
el recurso no es suyo, para no confirmar que existe. Implementado en `DELETE /auth/sessions/:id` y en
los archivos (`/uploads/:id/…`, `PUT /users/me/avatar`).

## Rutas actuales

| Ruta                                                                                                                                                                                                | Acceso                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`, `GET /health/ready`                                                                                                                                                             | Público                                                                                                                                                                                           |
| `GET /locations/provinces`, `/localities`, `/neighborhoods` (solo aprobados), `GET /professions`                                                                                                    | Público                                                                                                                                                                                           |
| `POST /auth/register`, `/login`, `/mfa/verify`, `/refresh`, `/logout`, `/email/verify`, `/password/forgot`, `/password/reset`, `GET /auth/csrf`                                                     | Público (refresh, logout y csrf usan la cookie de refresh)                                                                                                                                        |
| `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/logout-all`                                                                                                          | Con sesión, cualquier estado salvo `DEACTIVATED`                                                                                                                                                  |
| `POST /auth/email/resend`, `POST /auth/password/change`, `DELETE /users/me`                                                                                                                         | Con sesión, `PENDING_VERIFICATION` o `ACTIVE`                                                                                                                                                     |
| `GET /auth/google`, `/auth/google/callback`, `/auth/google/pending`, `POST /auth/google/link`, `/link/email`, `/link/confirm`, `/register`                                                          | Público (404 si `GOOGLE_PROVIDER=disabled`)                                                                                                                                                       |
| `DELETE /auth/google/link`, `POST /auth/password/set`                                                                                                                                               | Con sesión, `PENDING_VERIFICATION` o `ACTIVE` (ADR 0023)                                                                                                                                          |
| `/chat/*`, `/requests/*`, `/contracts/*`, `/notifications/*`                                                                                                                                        | `CUSTOMER` o `PROFESSIONAL` **activos**. Abrir chats y pedir trabajos: solo el cliente; presupuestos y avance de la contratación: solo el profesional, con prueba o plan vigente. Ids ajenos: 404 |
| Socket.IO `/realtime`                                                                                                                                                                               | Cookie de acceso válida y origen permitido                                                                                                                                                        |
| `GET /catalog/professionals`, `GET /catalog/professionals/:slug` (30/min por IP: tiene email y teléfono)                                                                                            | Público                                                                                                                                                                                           |
| `GET /uploads/:id/content` (solo archivos públicos, adaptador local)                                                                                                                                | Público                                                                                                                                                                                           |
| `POST /webhooks/identity`                                                                                                                                                                           | Público, autenticado por **firma** del proveedor (sin CSRF ni Origin)                                                                                                                             |
| `POST /uploads`, `POST /uploads/:id/complete`, `PUT /uploads/:id/content`, `PUT /users/me/avatar`, `POST /identity-verification`, `GET /identity-verification/me`                                   | `CUSTOMER` o `PROFESSIONAL`, `PENDING_VERIFICATION` o `ACTIVE`                                                                                                                                    |
| `POST /admin/users/:id/password-reset`, `/suspend`, `/ban`, `/restore`, `/change-role`, `/revoke-sessions`, `DELETE /admin/users/:id`                                                               | `ADMIN` activo                                                                                                                                                                                    |
| `GET/PATCH /professionals/me` y sus rutas (`/theme`, `/attention-status`, `/professions`, `/service-areas`, `/media`, `/certifications`, `/social-links`, `/availability`), `GET /subscriptions/me` | `PROFESSIONAL`, `PENDING_VERIFICATION` o `ACTIVE`. Sumar contenido exige prueba o plan vigente (403 `SUBSCRIPTION_REQUIRED`)                                                                      |
| `GET/PATCH /users/me` (datos personales; nombre en revisión con identidad aprobada, ADR 0021)                                                                                                       | `CUSTOMER` o `PROFESSIONAL`, `PENDING_VERIFICATION` o `ACTIVE`                                                                                                                                    |
| `PATCH /admin/users/:id`, `PATCH /admin/professionals/:userId/profile`                                                                                                                              | `ADMIN` activo, con motivo; no sobre cuentas de admin                                                                                                                                             |
| `GET/PATCH /customers/me`                                                                                                                                                                           | `CUSTOMER`, `PENDING_VERIFICATION` o `ACTIVE`                                                                                                                                                     |
| `POST /admin/professionals/media/:id/hide` y `/restore`, `POST /admin/professionals/certifications/:id/hide` y `/restore`                                                                           | `ADMIN` activo, con motivo                                                                                                                                                                        |
| `GET /admin/identity-verifications`, `POST /admin/identity-verifications/:id/decision`                                                                                                              | `ADMIN` activo                                                                                                                                                                                    |
| `GET /admin/neighborhoods`, `POST /admin/neighborhoods/:id/approve`, `PATCH /admin/neighborhoods/:id`, `POST /admin/neighborhoods/:id/merge`                                                        | `ADMIN` activo                                                                                                                                                                                    |

**Garantía automática**: `test/route-security.e2e-spec.ts` recorre todas las rutas registradas y exige
401 sin sesión en todas salvo una lista explícita de rutas públicas, y 403 en todas las rutas
`/admin` para un cliente activo. Una ruta nueva marcada `@Public()` por error hace fallar el test.

La matriz completa por rol, estado, propiedad y plan está en el plan §10; se implementa por etapa.
