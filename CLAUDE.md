# Nexo PRO / Repara Ya — backend

API REST NestJS 12 + TypeORM 1.x + PostgreSQL, Node 26. Lo consume un frontend Next.js (cookies HttpOnly).

## Antes de tocar código

- Requisitos: `docs/flujo-integral.md` (principal) y `docs/contexto-funcional.md`. Plan técnico: `docs/PLAN_BACKEND_REPARA_YA_NEXO_PRO.md`.
- Las decisiones aprobadas de `docs/decisions/` prevalecen sobre el plan. Pendientes: `docs/decisions/pendientes.md`.
- Se trabaja una etapa por vez (`docs/prompts/PROMPT_CLAUDE_CODE_BACKEND.md` §14), en la rama `etapa-NN-nombre`; al cerrar una etapa se informa y se espera aprobación.
- No inventar reglas de negocio, precios, políticas legales ni APIs de proveedores. Ante una contradicción: señalarla y preguntar.

## Comandos

- `npm run start:dev` · `npm run build` · `npm run lint` · `npm run format:check` · `npm run typecheck`
- `npm test` (unitarios, `src/**/*.spec.ts`) · `npm run test:e2e` (`test/*.e2e-spec.ts`)
- `docker compose up -d` (requiere `.env` con `POSTGRES_PASSWORD`)

## Reglas permanentes

- Toda ruta es privada por defecto; `@Public()` solo cuando corresponde. Rutas admin con `@Roles('ADMIN')`.
- Ownership en los servicios: filtrar por el usuario en la consulta y responder 404 si no es propio.
- Todo input entra por un DTO con class-validator; todo string con `@MaxLength`; ids con `ParseUUIDPipe`.
- Nunca devolver entidades: DTOs de salida por audiencia. Nunca exponer hashes, tokens ni documentos.
- Tokens solo en cookies HttpOnly: nunca en el body, en `localStorage` ni en logs.
- `synchronize: false` siempre; todo cambio de esquema con migración revisada a mano.
- Nada de SQL concatenado: parámetros siempre; `ORDER BY` con lista blanca.
- Configuración solo desde `src/config/` (validada al iniciar); nada de `process.env` suelto en el código.
- Controllers delgados; reglas de negocio en services; efectos externos después del commit.
- Ninguna dependencia nueva sin justificarla y pedir aprobación.
- Nada está terminado sin lint, build y tests ejecutados y en verde; reportar el comando y el resultado real.
