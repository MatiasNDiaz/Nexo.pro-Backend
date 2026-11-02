# ADR 0004 — Versiones del stack

- **Fecha:** 02/11/2026 · **Estado:** aprobada

**Contexto.** El plan no fijaba versiones. Al iniciar el repo, las vigentes eran NestJS 12 y TypeORM 1.x; TypeORM 1.x exige Node ^22.13 o ≥24.11. El módulo de referencia de identidad se probó con NestJS 10 + TypeORM 0.3.

**Decisión.** NestJS 12 + TypeORM 1.x sobre Node 26 (local) y `node:26-slim` en Docker. TypeScript 6.0 (el que usa el CLI de Nest 12; `typescript-eslint` admite <6.1). Versiones exactas fijadas en `package.json` + lockfile.

**Consecuencias.**

- Los paquetes de Nest 12 se publican como ESM; el proyecto compila a CommonJS con `module: nodenext` (como la plantilla oficial) y Node los carga con `require(esm)`.
- Jest corre con `node --experimental-vm-modules` (también como la plantilla oficial).
- Lint con ESLint + typescript-eslint (lo exige el prompt; la plantilla oficial trae oxlint).
- El módulo de referencia se adapta en la etapa 7 (sus migraciones SQL no cambian).
