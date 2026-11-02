# ADR 0007 — Acceso de cuentas suspendidas o baneadas

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** C-35 (nueva, etapa 1)

**Contexto.** El cuestionario dice que una cuenta suspendida "no accede", pero también que puede apelar (FI §22.8).

**Decisión.** Una cuenta `SUSPENDED` o `BANNED` puede iniciar sesión **solo** para ver el motivo de la sanción, apelar y cerrar sesión. Todo lo demás responde 403.

**Consecuencias.** El `AccountStateGuard` (etapa 6) deniega por defecto esos estados; solo las rutas marcadas con `@AllowAccountStates('SUSPENDED','BANNED')` (`/auth/me`, apelaciones, logout) las admiten.
