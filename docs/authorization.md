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

| Acción            | Desde                                                       | Hacia                                                                                        | Revoca sesiones |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------- |
| `suspend`         | `ACTIVE`, `PENDING_VERIFICATION`                            | `SUSPENDED`                                                                                  | Sí              |
| `ban`             | `ACTIVE`, `PENDING_VERIFICATION`, `SUSPENDED`               | `BANNED`                                                                                     | Sí              |
| `restore`         | `SUSPENDED`, `BANNED`, o `DEACTIVATED` en período de gracia | `ACTIVE` si la identidad está aprobada; si no, `PENDING_VERIFICATION`                        | No              |
| `change-role`     | Cliente ↔ profesional (nunca ADMIN)                         | El otro rol; el perfil anterior queda inactivo                                               | Sí              |
| `revoke-sessions` | Cualquiera                                                  | Sin cambio de estado (cuenta comprometida, ADR 0014)                                         | Sí              |
| `DELETE` (baja)   | Cualquiera salvo ADMIN                                      | `DEACTIVATED` por 30 días (restaurable) y después anonimización con `npm run accounts:purge` | Sí              |

Transición inválida → 409 `INVALID_STATE_TRANSITION`. Ninguna se aplica a una cuenta ADMIN
(409 `CANNOT_MODIFY_ADMIN`). Las cuentas activas también pueden darse de baja solas (`DELETE /users/me`,
con contraseña).

## Ownership (recursos propios)

No es un guard: cada servicio filtra por el usuario **en la consulta** y responde **404** (no 403) si
el recurso no es suyo, para no confirmar que existe. Ejemplo implementado: `DELETE /auth/sessions/:id`.

## Rutas actuales

| Ruta                                                                                                                                            | Acceso                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /health/live`, `GET /health/ready`                                                                                                         | Público                                                    |
| `GET /locations/provinces`, `/localities`, `/neighborhoods` (solo aprobados), `GET /professions`                                                | Público                                                    |
| `POST /auth/register`, `/login`, `/mfa/verify`, `/refresh`, `/logout`, `/email/verify`, `/password/forgot`, `/password/reset`, `GET /auth/csrf` | Público (refresh, logout y csrf usan la cookie de refresh) |
| `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/logout-all`                                                      | Con sesión, cualquier estado salvo `DEACTIVATED`           |
| `POST /auth/email/resend`, `POST /auth/password/change`, `DELETE /users/me`                                                                     | Con sesión, `PENDING_VERIFICATION` o `ACTIVE`              |
| `POST /admin/users/:id/password-reset`, `/suspend`, `/ban`, `/restore`, `/change-role`, `/revoke-sessions`, `DELETE /admin/users/:id`           | `ADMIN` activo                                             |

**Garantía automática**: `test/route-security.e2e-spec.ts` recorre todas las rutas registradas y exige
401 sin sesión en todas salvo una lista explícita de rutas públicas, y 403 en todas las rutas
`/admin` para un cliente activo. Una ruta nueva marcada `@Public()` por error hace fallar el test.

La matriz completa por rol, estado, propiedad y plan está en el plan §10; se implementa por etapa.
