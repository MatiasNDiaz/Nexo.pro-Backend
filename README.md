# Nexo PRO / Repara Ya — Backend

API REST de un marketplace que conecta clientes con profesionales de oficios en Córdoba Capital.
NestJS 12 · TypeORM 1.x · PostgreSQL 17 · Node 26. La consume un frontend Next.js con cookies HttpOnly.

> Estado: **etapa 6 (autorización y estados de cuenta)**. Ver `docs/roadmap.md`, `docs/architecture.md` y `docs/auth.md`.

## Requisitos

- Node 26 (`.nvmrc`) y npm 11
- Docker Desktop (para PostgreSQL local)

## Puesta en marcha

1. Dependencias: `npm ci`
2. Docker Compose: copiá `.env.example` como `.env` y completá `POSTGRES_PASSWORD` y `POSTGRES_APP_PASSWORD` (letras y números).
3. Base de datos: `docker compose up -d postgres` (PostgreSQL en `127.0.0.1:5433`, o el puerto de `POSTGRES_HOST_PORT`). Crea las bases `nexo_dev` y `nexo_test` y el rol de runtime `nexo_app`.
4. Secretos locales: creá `.env.development.local` (ver `docs/env.md`) con las dos URLs y los
   secretos de autenticación (generá cada uno con
   `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`; para
   `DATA_ENCRYPTION_KEY`, `randomBytes(32)`):
   ```
   DATABASE_URL=postgres://nexo_app:<POSTGRES_APP_PASSWORD>@localhost:5433/nexo_dev
   DATABASE_MIGRATIONS_URL=postgres://nexo:<POSTGRES_PASSWORD>@localhost:5433/nexo_dev
   JWT_ACCESS_SECRET=…
   CSRF_SECRET=…
   DATA_ENCRYPTION_KEY=…
   DATA_HMAC_KEY=…
   ```
   y `.env.test.local` con `DATABASE_URL=postgres://nexo:<POSTGRES_PASSWORD>@localhost:5433/nexo_test`.
5. Esquema y catálogos: `npm run migration:run` y `npm run seed:catalogs`
6. Admin inicial (una sola vez): `npm run admin:create -- --email … --first-name … --last-name … --phone …`.
   Muestra la contraseña, el secreto TOTP y los códigos de recuperación **una sola vez**.
7. API: `npm run start:dev` → `http://localhost:3001`. En desarrollo los emails se imprimen en la consola.

- Health: `GET /api/v1/health/live` (proceso) y `GET /api/v1/health/ready` (base de datos)
- Swagger (solo desarrollo): `http://localhost:3001/api/docs`
- API + base en contenedores: `docker compose up -d --build`

## Comandos

| Comando                                                               | Qué hace                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run start:dev`                                                   | API con recarga automática                                             |
| `npm run build` / `npm run start:prod`                                | Compila a `dist/` / ejecuta lo compilado                               |
| `npm run lint` · `npm run format:check` · `npm run typecheck`         | Calidad                                                                |
| `npm test` · `npm run test:int` · `npm run test:e2e`                  | Pruebas (ver `docs/testing.md`)                                        |
| `npm run migration:run` · `migration:revert` · `migration:show`       | Migraciones (compila y usa la CLI de TypeORM)                          |
| `npm run migration:create -- src/database/migrations/NombreDelCambio` | Crea una migración vacía (después registrala en `migrations/index.ts`) |
| `npm run seed:catalogs`                                               | Ubicaciones, oficios y planes (idempotente)                            |
| `npm run admin:create -- --email …`                                   | Crea el único admin con segundo factor TOTP                            |
| `npm run accounts:purge`                                              | Anonimiza las cuentas dadas de baja con la gracia vencida (diario)     |

## Documentación

| Documento                                                                         | Contenido                                            |
| --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `docs/flujo-integral.md`                                                          | Especificación funcional (fuente principal)          |
| `docs/PLAN_BACKEND_REPARA_YA_NEXO_PRO.md`                                         | Plan técnico completo                                |
| `docs/decisions/`                                                                 | Decisiones aprobadas (ADR) y pendientes              |
| `docs/architecture.md` · `docs/data-model.md` · `docs/env.md` · `docs/testing.md` | Estado actual del código                             |
| `docs/auth.md` · `docs/authorization.md`                                          | Autenticación (con guía para el frontend) y permisos |
| `CLAUDE.md`                                                                       | Reglas permanentes del repositorio                   |
