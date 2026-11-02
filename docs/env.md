# Variables de entorno

La app valida el entorno al iniciar (`src/config/env.validation.ts`). Si falta una variable o es inválida, **no arranca** y el error muestra el nombre de la variable y la regla incumplida, nunca su valor (tampoco la contraseña de una URL de base de datos).

## Archivos

| Archivo                   | ¿Se versiona? | Uso                                                                                                        |
| ------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `.env.example`            | Sí            | Plantilla con todas las variables, sin valores reales                                                      |
| `.env.development`        | Sí            | Valores de desarrollo **sin secretos**                                                                     |
| `.env.development.local`  | No            | Tus secretos locales: `DATABASE_URL` y `DATABASE_MIGRATIONS_URL`. Tiene prioridad sobre `.env.development` |
| `.env.test`               | Sí            | Valores para Jest; la URL apunta al PostgreSQL efímero de la CI                                            |
| `.env.test.local`         | No            | Tu `DATABASE_URL` de tests (base `nexo_test` del Docker local)                                             |
| `.env.production.example` | Sí            | Referencia para cargar en Railway. En producción no se leen archivos: todo viene del panel                 |
| `.env`                    | No            | Solo para Docker Compose (contraseñas de PostgreSQL, puerto del host)                                      |

La app, la CLI de migraciones y los tests leen `.env.<NODE_ENV>.local` y después `.env.<NODE_ENV>`. Las variables del sistema operativo tienen prioridad sobre los archivos.

## Variables de la API

| Variable                  | Obligatoria | Defecto        | Descripción                                                                                                           |
| ------------------------- | ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | Sí          | —              | `development`, `test` o `production`                                                                                  |
| `PORT`                    | No          | `3001`         | Puerto HTTP (Next.js usa el 3000)                                                                                     |
| `API_PREFIX`              | No          | `api`          | Prefijo global; la versión va por URI: `/api/v1/...`                                                                  |
| `FRONTEND_ORIGINS`        | Sí          | —              | Orígenes exactos del frontend separados por coma. Sin comodines, sin path ni barra final. En producción, solo `https` |
| `TRUST_PROXY`             | No          | `0`            | Cantidad de proxies delante de la API (Railway: `1`). Afecta la IP que ven el rate limit y los logs                   |
| `BODY_LIMIT`              | No          | `100kb`        | Tamaño máximo del body JSON/urlencoded                                                                                |
| `SWAGGER_ENABLED`         | No          | `false`        | Publica `/api/docs`. **Prohibido en producción** (la validación lo rechaza)                                           |
| `LOG_LEVEL`               | No          | `info`         | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent`                                                         |
| `THROTTLE_TTL_MS`         | No          | `60000`        | Ventana del rate limit global (ms)                                                                                    |
| `THROTTLE_LIMIT`          | No          | `100`          | Requests por IP en esa ventana                                                                                        |
| `DATABASE_URL`            | Sí          | —              | `postgres://usuario:clave@host:puerto/base` del **rol de runtime** (sin DDL)                                          |
| `DATABASE_MIGRATIONS_URL` | No          | `DATABASE_URL` | Conexión del **dueño del esquema**, solo para migraciones y seeds                                                     |
| `DB_SSL`                  | No          | `false`        | TLS hacia PostgreSQL (verifica el certificado). En la red privada de Railway no hace falta                            |
| `DB_POOL_MAX`             | No          | `10`           | Conexiones máximas del pool                                                                                           |

## Docker Compose (`.env`)

| Variable                | Defecto         | Descripción                                                       |
| ----------------------- | --------------- | ----------------------------------------------------------------- |
| `POSTGRES_PASSWORD`     | — (obligatoria) | Contraseña del dueño del esquema (`nexo`)                         |
| `POSTGRES_APP_PASSWORD` | — (obligatoria) | Contraseña del rol de runtime `nexo_app`. Solo letras y números   |
| `POSTGRES_USER`         | `nexo`          | Dueño del esquema                                                 |
| `POSTGRES_DB`           | `nexo_dev`      | Base de desarrollo (también se crea `nexo_test`)                  |
| `POSTGRES_HOST_PORT`    | `5433`          | Puerto en tu máquina (solo `127.0.0.1`). Cambialo si está ocupado |

El script `docker/postgres/init/` solo corre con el volumen vacío. Si cambiás las contraseñas después, recreá el volumen: `docker compose down -v` (borra los datos locales).

## Producción (Railway)

- Cargá `DATABASE_URL` con un rol de runtime **sin permisos de DDL** si el plan de Railway permite crear roles (`CREATE ROLE … LOGIN`, `GRANT SELECT, INSERT, UPDATE, DELETE`, ver `docker/postgres/init/`). Si no se puede, ambas URLs apuntan al mismo usuario; la auditoría sigue siendo append-only por el trigger.
- Migraciones como paso previo al deploy, con `DATABASE_MIGRATIONS_URL`:
  `npx typeorm migration:run -d dist/database/data-source.js`

## Próximas etapas

Se agregan con su etapa y se documentan acá: JWT, cookies, CSRF, `FRONTEND_URL` y claves de cifrado/HMAC (5); almacenamiento, email, pagos e identidad (7 y 9). Lista propuesta: plan §15.2.
