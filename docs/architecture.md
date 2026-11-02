# Arquitectura

Monolito modular NestJS (plan §5–7). Controllers delgados, reglas de negocio en services, acceso a datos con TypeORM, integraciones externas detrás de interfaces en `src/integrations/`. Este documento describe **lo que existe hoy**; el diseño completo está en el plan.

## Estado por etapa

| Etapa                       | Estado                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3. Bootstrap                | Hecha: configuración validada, pipeline HTTP, errores, logger, rate limit, Swagger, health live, Docker, CI                                                                                              |
| 4. Base de datos            | Hecha: TypeORM, migraciones, roles de base, auditoría append-only, catálogos (ubicaciones, oficios, planes), `/health/ready`                                                                             |
| 5. Usuarios y autenticación | Hecha: registro en dos pasos con barrios creados por usuarios, login con cookies, refresh rotativo, CSRF, MFA del admin, reset por admin, guards globales (ver `docs/auth.md` y `docs/authorization.md`) |
| 6. Autorización y estados   | Hecha: suspensión, baneo, restauración, cambio de rol, revocación de sesiones y baja con anonimización (admin y propia); test que recorre todas las rutas                                                |
| 7–13                        | Pendientes (ver `docs/roadmap.md`, incluye la etapa 7B de login con Google)                                                                                                                              |

## Estructura actual

```
src/
├── main.ts                 # crea la app y escucha en PORT
├── app.module.ts           # config, logger, throttler, base de datos, auditoría y providers globales
├── app.setup.ts            # configureApp(): pipeline HTTP compartido por main.ts y los tests e2e
├── config/
│   ├── env.validation.ts   # esquema del entorno (class-validator) y validateEnv()
│   ├── app.config.ts       # namespace tipado `app`
│   ├── database.config.ts  # namespace tipado `database`
│   └── load-env-files.ts   # .env.* para procesos fuera de Nest (CLI, seeds, tests)
├── common/
│   ├── errors/api-error.ts         # formato único de error
│   ├── filters/all-exceptions.filter.ts   # incluye 23505/23503 de PostgreSQL → 409
│   ├── pipes/create-validation-pipe.ts
│   └── logging/logger.options.ts   # pino: redacción y X-Request-Id
├── database/
│   ├── data-source.options.ts  # opciones compartidas (app, CLI, tests) y lista de entidades
│   ├── data-source.ts          # DataSource de la CLI de migraciones
│   ├── database.module.ts      # TypeOrmModule
│   ├── snake-naming.strategy.ts
│   ├── transformers.ts
│   ├── migrations/             # SQL escrito a mano + index.ts con la lista ordenada
│   └── seeds/                  # catálogos maestros idempotentes + CLI
├── common/decorators/      # @Public, @Roles, @AllowAccountStates, @CurrentUser, @SkipCsrf…
├── common/guards/          # Origin, JwtAuth, Csrf, AccountState, Roles (globales)
├── common/crypto/          # tokens aleatorios, SHA-256, HMAC, AES-256-GCM
├── auth/                   # registro, login, MFA, sesiones, CSRF, cookies, reset, CLI admin:create
├── users/                  # entidad y enums de usuario
├── professionals/entities/ # perfil mínimo, profesiones y zonas de trabajo
├── integrations/mail/      # MailProvider + adaptadores consola/memoria
├── audit/                  # AuditService (puerto AUDIT_LOGGER), global
├── locations/              # provincias, localidades, barrios (normalización, autocompletado)
├── professions/            # catálogo público de oficios
├── subscriptions/entities/ # planes
└── health/                 # GET /api/v1/health/live y /ready
test/
├── setup/                  # reset de la base de test (globalSetup)
├── utils/                  # app de test y cliente con cookies (auth-client)
├── integration/            # contra PostgreSQL real
└── *.e2e-spec.ts           # app real con Supertest
```

`locations` y `professions` exponen solo lo que necesita el registro; su administración llega en la etapa 7.

## Pipeline de una request

```mermaid
flowchart LR
  A[Request] --> B[body-parser con límite]
  B --> C[Helmet]
  C --> D[cookie-parser]
  D --> E[CORS allowlist]
  E --> F[pino-http: X-Request-Id + log con redacción]
  F --> G[Throttler → Origin → JWT cookie → CSRF → Estado de cuenta → Roles]
  G --> H[ValidationPipe whitelist]
  H --> I[Controller]
  I -. excepción .-> J[AllExceptionsFilter: formato único]
```

Detalle de cada guard en `docs/authorization.md`. El de suscripción/plan llega en las etapas 7 y 9.

## Decisiones técnicas

**Etapa 3**

- **`configureApp()` compartido:** los tests e2e levantan exactamente el mismo pipeline que producción.
- **Pipe, filtro y guard como providers globales (`APP_*`):** también aplican en los tests sin repetir código.
- **El servidor genera el `X-Request-Id`** y no acepta el que manda el cliente.
- **Errores 5xx sin detalles:** el mensaje y el stack van solo al log.
- **Configuración:** `validateEnv()` es la única fuente de defaults y tipos. `@nestjs/config` 12 solo copia a `process.env` valores escalares, por eso la validación de `ConfigModule` devuelve las variables crudas y los namespaces arman la versión tipada.
- **La app escucha en IPv4 e IPv6** (sin host fijo), así `localhost` funciona aunque resuelva a `::1`.

**Etapa 4**

- **Migraciones en SQL escrito a mano** y registradas en una lista explícita (`migrations/index.ts`), sin globs: funcionan igual en Jest, en la CLI y en la imagen. Un test detecta archivos sin registrar.
- **Nombres de constraints deterministas** (`SnakeNamingStrategy`): permiten el test que compara entidades con el esquema real.
- **Dos roles de base:** la API corre con un rol sin DDL; las migraciones, con el dueño del esquema.
- **Auditoría append-only en la base** (trigger) además de los permisos, para que funcione aunque el proveedor no permita crear roles.
- **`logging: false` en TypeORM** y redacción de `parameters` en el logger: los errores de queries incluyen los valores enviados (emails, hashes).
- **`installExtensions: false`:** TypeORM no intenta crear extensiones al conectarse (el rol de runtime no puede); las crean las migraciones.
- **Seeds idempotentes que no pisan datos:** `ON CONFLICT DO NOTHING` sobre la clave natural.

**Etapa 5**

- **JWT corto + sesión en base:** el guard valida la firma y además que la sesión `sid` siga viva; rol y
  estado se leen de la base en cada request (revocación efectiva en la request siguiente).
- **Una fila por refresh token** (`auth_sessions`); la familia es el dispositivo. Rotación atómica con
  `SELECT … FOR UPDATE`; la detección de reutilización y su auditoría se confirman antes de responder 401.
- **CSRF ligado a la familia** (no al `sid`): no cambia en cada refresh. En el refresh, un token ya
  rotado se procesa antes de exigir CSRF, para que un refresh robado igual dispare la revocación.
- **Rotación del secreto JWT** con `kid` en el header (secreto actual y anterior).
- **Emails por eventos después del commit** (`@nestjs/event-emitter` + `emitAsync`): no se manda un
  email por algo revertido, y los tests leen el buzón en memoria de forma determinista.
- **`import type` en firmas decoradas:** con `isolatedModules` + `emitDecoratorMetadata`, los tipos
  usados en constructores con `@Inject` se importan como tipo.
- **Barrios por "buscar o crear"** con `INSERT … ON CONFLICT DO NOTHING` (sin carreras) dentro de la
  transacción del registro.

**Etapa 6**

- **`AccountsService` (módulo `users`)** concentra el ciclo de vida: cada acción bloquea la fila del
  usuario (`FOR UPDATE`), valida la transición, revoca sesiones y audita en una sola transacción.
- **`ProfessionalsService`** (alta, reactivación y desactivación del perfil, zonas de trabajo) lo usan
  el registro y el cambio de rol: una sola implementación de las reglas de la ADR 0010.
- **Sin tabla `role_changes`**: el historial de roles vive en la auditoría (`ROLE_CHANGED`).
- **Test de todas las rutas**: lee las rutas registradas en Express y exige 401 sin sesión salvo una
  lista explícita de públicas.
