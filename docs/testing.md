# Pruebas

| Tipo        | Ubicación                        | Comando            | Base de datos | Qué cubre hoy                                                                                                                                                                      |
| ----------- | -------------------------------- | ------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias   | `src/**/*.spec.ts`               | `npm test`         | No            | Validación del entorno, filtro de errores (incluye errores de PostgreSQL), ValidationPipe, redacción del logger, health, naming strategy, lista de migraciones, saneo de auditoría |
| Integración | `test/integration/*.int-spec.ts` | `npm run test:int` | Sí            | Entidades = esquema real, migraciones up/down desde cero, auditoría append-only, seed idempotente, constraints                                                                     |
| E2E         | `test/*.e2e-spec.ts`             | `npm run test:e2e` | Sí            | App real con Supertest: health live/ready, prefijo/versión, Helmet, CORS, 404/413/400, rate limit 429, arranque con entorno inválido                                               |

Los tests corren con `node --experimental-vm-modules` porque los paquetes de NestJS 12 son ESM (ver ADR 0004). Para ocultar el aviso experimental: `NODE_OPTIONS=--no-warnings=ExperimentalWarning`.

## Base de datos de test

- Integración y e2e usan un `globalSetup` (`test/setup/global-setup.ts`) que **borra el esquema `public`**, corre todas las migraciones y carga los catálogos.
- Por seguridad, se niega a correr si `NODE_ENV` no es `test` o si el nombre de la base no termina en `_test`.
- En tu máquina: `docker compose up -d postgres` y `.env.test.local` con la URL de `nexo_test` (ver `docs/env.md`). En la CI, un servicio PostgreSQL efímero.
- Cada test que modifica datos usa una transacción que se revierte, o deja la base como la encontró.

## Reglas

- Los e2e usan `test/utils/create-test-app.ts`, que aplica `configureApp()`: se prueba el mismo pipeline que en producción.
- Un test que necesita otro entorno (por ejemplo, `THROTTLE_LIMIT=3`) cambia `process.env` antes de crear la app. Jest aísla `process.env` por archivo.
- Ninguna etapa se da por terminada sin `lint`, `format:check`, `typecheck`, `build`, `test`, `test:int` y `test:e2e` en verde.

## Auditoría de dependencias

CI corre `npm audit --omit=dev --audit-level=high`: solo las dependencias que llegan a la imagen de producción. Las de desarrollo (jest, eslint, CLI de Nest) tienen avisos moderados heredados de `minimatch`, `glob` y `deepmerge`, cuyo único "arreglo" propuesto es bajar de versión mayor. Se revisan en cada etapa.
