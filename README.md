# Nexo PRO / Repara Ya — Backend

API REST de un marketplace que conecta clientes con profesionales de oficios en Córdoba Capital.
NestJS 12 · TypeORM 1.x · PostgreSQL 17 · Node 26. La consume un frontend Next.js con cookies HttpOnly.

> Estado: **etapa 3 (bootstrap)**. Todavía no hay base de datos, usuarios ni autenticación. Ver `docs/architecture.md`.

## Requisitos

- Node 26 (`.nvmrc`) y npm 11
- Docker Desktop (para PostgreSQL local)

## Puesta en marcha

```bash
npm ci
cp .env.example .env            # solo para Docker Compose: completá POSTGRES_PASSWORD
docker compose up -d postgres   # PostgreSQL en 127.0.0.1:5433 (configurable)
npm run start:dev               # API en http://localhost:3001
```

- Health: `GET http://localhost:3001/api/v1/health/live`
- Swagger (solo desarrollo): `http://localhost:3001/api/docs`
- API + base en contenedores: `docker compose up -d --build`

Las variables están explicadas en `docs/env.md`. Los secretos locales van en `.env.development.local` (no se versiona).

## Comandos

| Comando                                                       | Qué hace                                 |
| ------------------------------------------------------------- | ---------------------------------------- |
| `npm run start:dev`                                           | API con recarga automática               |
| `npm run build` / `npm run start:prod`                        | Compila a `dist/` / ejecuta lo compilado |
| `npm run lint` · `npm run format:check` · `npm run typecheck` | Calidad                                  |
| `npm test` · `npm run test:e2e` · `npm run test:cov`          | Pruebas (ver `docs/testing.md`)          |

Migraciones y datos iniciales: a partir de la etapa 4.

## Documentación

| Documento                                                  | Contenido                                   |
| ---------------------------------------------------------- | ------------------------------------------- |
| `docs/flujo-integral.md`                                   | Especificación funcional (fuente principal) |
| `docs/PLAN_BACKEND_REPARA_YA_NEXO_PRO.md`                  | Plan técnico completo                       |
| `docs/decisions/`                                          | Decisiones aprobadas (ADR) y pendientes     |
| `docs/architecture.md` · `docs/env.md` · `docs/testing.md` | Estado actual del código                    |
| `CLAUDE.md`                                                | Reglas permanentes del repositorio          |
