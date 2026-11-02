# Pruebas

| Tipo        | Ubicación                        | Comando            | Base de datos | Qué cubre hoy                                                                                                                                                                                                               |
| ----------- | -------------------------------- | ------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias   | `src/**/*.spec.ts`               | `npm test`         | No            | Validación del entorno, filtro de errores, ValidationPipe, redacción del logger, health, naming strategy, migraciones, auditoría, cifrado, nombres de barrios, guards, cookies de producción, CSRF, bloqueo progresivo, MFA |
| Integración | `test/integration/*.int-spec.ts` | `npm run test:int` | Sí            | Entidades = esquema real, migraciones up/down desde cero, auditoría append-only, seed idempotente, constraints                                                                                                              |
| E2E         | `test/*.e2e-spec.ts`             | `npm run test:e2e` | Sí            | App real con Supertest y cookies reales: los casos del plan §9.10, registro y barrios, MFA del admin, reset por admin, health, CORS, errores, rate limit                                                                    |

Los tests corren con `node --experimental-vm-modules` porque los paquetes de NestJS 12 son ESM (ver ADR 0004). Para ocultar el aviso experimental: `NODE_OPTIONS=--no-warnings=ExperimentalWarning`.

## Base de datos de test

- Integración y e2e usan un `globalSetup` (`test/setup/global-setup.ts`) que **borra el esquema `public`**, corre todas las migraciones y carga los catálogos.
- Por seguridad, se niega a correr si `NODE_ENV` no es `test` o si el nombre de la base no termina en `_test`.
- En tu máquina: `docker compose up -d postgres` y `.env.test.local` con la URL de `nexo_test` (ver `docs/env.md`). En la CI, un servicio PostgreSQL efímero.
- Cada test que modifica datos usa una transacción que se revierte, o deja la base como la encontró.

## E2E de autenticación

- `test/utils/auth-client.ts` define `Client`: un "navegador" con su propio cookie jar, `Origin` y
  `X-Requested-With` por defecto y el token CSRF guardado en memoria, como el frontend.
- Cada `Client` simula su propia IP (`X-Forwarded-For`, con `TRUST_PROXY=1` en `.env.test`), así los
  límites por IP de login y registro no se mezclan entre tests. El test de rate limit reusa una IP.
- Los emails van al `MemoryMailProvider` (`MAIL_PROVIDER=memory`); `lastMailToken()` saca el token
  del último enlace enviado a una dirección.
- `createAdmin()` crea un admin con TOTP directo en la base (en producción, `npm run admin:create`).

Cobertura del plan §9.10: casos 1 a 14 en `auth.e2e-spec.ts` y `admin-auth.e2e-spec.ts`; el caso 15
(cambio de rol o suspensión revoca sesiones) en `account-lifecycle.e2e-spec.ts`.

`route-security.e2e-spec.ts` recorre todas las rutas registradas: sin sesión → 401 salvo la lista
`PUBLIC_ROUTES`; con un cliente activo, toda ruta `/admin` → 403. **Si agregás una ruta pública, sumala
a esa lista a propósito.**

## Reglas

- Los e2e usan `test/utils/create-test-app.ts`, que aplica `configureApp()`: se prueba el mismo pipeline que en producción.
- Un test que necesita otro entorno (por ejemplo, `THROTTLE_LIMIT=3`) cambia `process.env` antes de crear la app. Jest aísla `process.env` por archivo.
- Ninguna etapa se da por terminada sin `lint`, `format:check`, `typecheck`, `build`, `test`, `test:int` y `test:e2e` en verde.

## Auditoría de dependencias

CI corre `npm audit --omit=dev --audit-level=high`: solo las dependencias que llegan a la imagen de producción. Las de desarrollo (jest, eslint, CLI de Nest) tienen avisos moderados heredados de `minimatch`, `glob` y `deepmerge`, cuyo único "arreglo" propuesto es bajar de versión mayor. Se revisan en cada etapa.
