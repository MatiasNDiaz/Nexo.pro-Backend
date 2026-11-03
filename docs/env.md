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

| Variable                  | Obligatoria | Defecto        | Descripción                                                                                                                          |
| ------------------------- | ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                | Sí          | —              | `development`, `test` o `production`                                                                                                 |
| `PORT`                    | No          | `3001`         | Puerto HTTP (Next.js usa el 3000)                                                                                                    |
| `API_PREFIX`              | No          | `api`          | Prefijo global; la versión va por URI: `/api/v1/...`                                                                                 |
| `FRONTEND_ORIGINS`        | Sí          | —              | Orígenes exactos del frontend separados por coma. Sin comodines, sin path ni barra final. En producción, solo `https`                |
| `TRUST_PROXY`             | No          | `0`            | Cantidad de proxies delante de la API (Railway: `1`). Afecta la IP que ven el rate limit y los logs. **En producción, al menos `1`** |
| `BODY_LIMIT`              | No          | `100kb`        | Tamaño máximo del body JSON/urlencoded                                                                                               |
| `SWAGGER_ENABLED`         | No          | `false`        | Publica `/api/docs`. **Prohibido en producción** (la validación lo rechaza)                                                          |
| `LOG_LEVEL`               | No          | `info`         | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent`                                                                        |
| `THROTTLE_TTL_MS`         | No          | `60000`        | Ventana del rate limit global (ms)                                                                                                   |
| `THROTTLE_LIMIT`          | No          | `100`          | Requests por IP en esa ventana                                                                                                       |
| `DATABASE_URL`            | Sí          | —              | `postgres://usuario:clave@host:puerto/base` del **rol de runtime** (sin DDL)                                                         |
| `DATABASE_MIGRATIONS_URL` | No          | `DATABASE_URL` | Conexión del **dueño del esquema**, solo para migraciones y seeds                                                                    |
| `DB_SSL`                  | No          | `false`        | TLS hacia PostgreSQL (verifica el certificado). En la red privada de Railway no hace falta                                           |
| `DB_POOL_MAX`             | No          | `10`           | Conexiones máximas del pool                                                                                                          |
| `DB_STATEMENT_TIMEOUT_MS` | No          | `15000`        | Tiempo máximo de una consulta de la app (las migraciones no lo usan); una transacción sin actividad se corta al doble                |

## Variables de autenticación (etapa 5)

Secretos: generalos con `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
(para `DATA_ENCRYPTION_KEY`, `randomBytes(32)`). Uno distinto por ambiente; nunca en el repo.

| Variable                               | Obligatoria | Defecto                         | Descripción                                                                                                             |
| -------------------------------------- | ----------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `FRONTEND_URL`                         | Sí          | —                               | Base de los enlaces de los emails. En producción, `https`                                                               |
| `JWT_ACCESS_SECRET`                    | Sí          | —                               | Secreto HS256 del access token (≥ 64 caracteres)                                                                        |
| `JWT_ACCESS_SECRET_PREVIOUS`           | No          | —                               | Secreto anterior durante una rotación: se acepta para verificar, no para firmar                                         |
| `JWT_ISSUER` / `JWT_AUDIENCE`          | No          | `nexo-api` / `nexo-web`         | Claims `iss` y `aud`                                                                                                    |
| `ACCESS_TOKEN_TTL_SEC` / `ADMIN_…`     | No          | `600` / `300`                   | Vida del access token (ADR 0008)                                                                                        |
| `REFRESH_IDLE_TTL_SEC` / `ADMIN_…`     | No          | 14 días / 12 h                  | Vencimiento por inactividad                                                                                             |
| `REFRESH_ABSOLUTE_TTL_SEC` / `ADMIN_…` | No          | 30 días / 7 días                | Vida máxima de la sesión                                                                                                |
| `COOKIE_SECURE`                        | No          | `false`                         | `Secure` + prefijos `__Host-`/`__Secure-`. **Obligatorio `true` en producción**                                         |
| `CSRF_SECRET`                          | Sí          | —                               | HMAC del token CSRF (≥ 32 caracteres)                                                                                   |
| `DATA_ENCRYPTION_KEY`                  | Sí          | —                               | AES-256-GCM (64 caracteres hex). Cifra el secreto TOTP del admin                                                        |
| `DATA_ENCRYPTION_KEY_VERSION`          | No          | `1`                             | Versión de la clave (para rotarla)                                                                                      |
| `DATA_HMAC_KEY`                        | Sí          | —                               | Seudonimiza datos (IP de las sesiones). ≥ 32 caracteres                                                                 |
| `PASSWORD_SELF_RESET_ENABLED`          | No          | `false`                         | "Olvidé mi contraseña" autoservicio (ADR 0002: apagado)                                                                 |
| `MAIL_PROVIDER`                        | No          | `console`                       | `console` (desarrollo) o `memory` (tests). **En producción ninguno de los dos es válido**: hace falta un proveedor real |
| `MAIL_FROM`                            | No          | `Nexo PRO <no-reply@localhost>` | Remitente                                                                                                               |
| `MAX_SERVICE_AREAS`                    | No          | `20`                            | Zonas de trabajo por profesional (ADR 0010)                                                                             |
| `ACCOUNT_DELETION_GRACE_DAYS`          | No          | `30`                            | Días que una cuenta dada de baja queda restaurable antes de anonimizarse (ADR 0016)                                     |

## Archivos e identidad (etapa 7.1)

| Variable                       | Obligatoria      | Defecto    | Descripción                                                                                           |
| ------------------------------ | ---------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `STORAGE_PROVIDER`             | No               | `local`    | `local` (disco: desarrollo y tests) o `cloudinary`. **En producción solo `cloudinary`** (ADR 0018)    |
| `STORAGE_LOCAL_DIR`            | No               | `.uploads` | Carpeta del adaptador local (ignorada por git; en Docker, volumen `uploads`)                          |
| `CLOUDINARY_CLOUD_NAME`        | Con `cloudinary` | —          | Nombre de la cuenta                                                                                   |
| `CLOUDINARY_API_KEY`           | Con `cloudinary` | —          | Clave de API                                                                                          |
| `CLOUDINARY_API_SECRET`        | Con `cloudinary` | —          | **Secreto**: firma las subidas. Nunca en el frontend ni en logs                                       |
| `CLOUDINARY_FOLDER`            | No               | `nexo-dev` | Carpeta raíz, una por ambiente (`nexo-dev`, `nexo-prod`)                                              |
| `IDENTITY_PROVIDER`            | No               | `manual`   | `manual` (decide el admin, ADR 0003) o `fake` (simulado: desarrollo y tests, prohibido en producción) |
| `IDENTITY_MAX_ATTEMPTS`        | No               | `3`        | Intentos de verificación por usuario antes de pedir contacto con soporte                              |
| `FAKE_IDENTITY_WEBHOOK_SECRET` | Con `fake`       | —          | Secreto HMAC de los webhooks simulados (≥ 32)                                                         |

En `.env.test` estas variables tienen valores fijos de prueba (públicos en el repo: no sirven para
otro ambiente) y `TRUST_PROXY=1`, para que cada cliente de los e2e simule su propia IP.

## Login con Google (etapa 7B)

| Variable               | Obligatoria           | Defecto    | Descripción                                                                                          |
| ---------------------- | --------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `GOOGLE_PROVIDER`      | No                    | `disabled` | `disabled` (sin Google), `google` o `fake` (simulado: desarrollo y tests, prohibido en producción)   |
| `GOOGLE_CLIENT_ID`     | Con `google`          | —          | ID del cliente OAuth de Google Cloud                                                                 |
| `GOOGLE_CLIENT_SECRET` | Con `google`          | —          | **Secreto** del cliente OAuth                                                                        |
| `GOOGLE_CALLBACK_URL`  | Con `google` o `fake` | —          | URL pública de `/api/v1/auth/google/callback`, igual a la registrada en Google (https en producción) |

## Pagos con Mercado Pago (etapa 9, ADR 0026)

| Variable                     | Obligatoria       | Defecto    | Descripción                                                                                              |
| ---------------------------- | ----------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `PAYMENTS_PROVIDER`          | No                | `disabled` | `disabled` (sin cobros: el checkout responde 503), `mercadopago` o `fake` (prohibido en producción)      |
| `MERCADOPAGO_ACCESS_TOKEN`   | Con `mercadopago` | —          | **Secreto**: access token de la cuenta (de prueba o productiva)                                          |
| `MERCADOPAGO_WEBHOOK_SECRET` | Con pagos activos | —          | **Secreto** de las notificaciones (Tus integraciones > Webhooks): valida `x-signature`. ≥ 32             |
| `API_PUBLIC_URL`             | Con pagos activos | —          | URL pública de la API sin prefijo; el webhook queda en `/api/v1/webhooks/payments` (https en producción) |

La vuelta del checkout va a `FRONTEND_URL/suscripcion/resultado` (el frontend consulta
`GET /subscriptions/me`: el pago se aplica cuando llega el aviso de Mercado Pago, no con la vuelta).

## Antiabuso y monitoreo (etapa 12)

| Variable                 | Obligatoria | Defecto | Descripción                                                                                                                                                                                    |
| ------------------------ | ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PASSWORD_BREACH_CHECK`  | No          | `false` | Rechaza contraseñas filtradas (Have I Been Pwned; solo viajan 5 caracteres del SHA-1). Si el servicio no responde, deja pasar                                                                  |
| `TURNSTILE_SECRET_KEY`   | No          | —       | **Secreto** de Cloudflare Turnstile. Con él, CAPTCHA en registro, contacto y login tras 3 fallos por IP (`CAPTCHA_REQUIRED`)                                                                   |
| `SENTRY_DSN`             | No          | —       | Reporta los errores 500 a Sentry sin datos personales. Sin él, apagado                                                                                                                         |
| `CLOUDFLARE_EDGE_SECRET` | No          | —       | **Secreto** (≥ 32) que Cloudflare agrega en `x-nexo-edge-secret`. Con él, la ciudad aproximada de Cloudflare va en el email de dispositivo nuevo (ADR 0031). Sin él: "ubicación no disponible" |

El frontend necesita además la **clave pública** (site key) de Turnstile para mostrar el widget y
mandar el token en `captchaToken`.

Los backups (`ops/backup`) corren en un servicio aparte con sus propias variables: ver
`docs/operacion.md`.

## Notificaciones push (etapa 13.3, ADR 0032)

| Variable            | Obligatoria   | Defecto    | Descripción                                                                             |
| ------------------- | ------------- | ---------- | --------------------------------------------------------------------------------------- |
| `PUSH_PROVIDER`     | No            | `disabled` | `disabled`, `webpush` o `fake` (solo tests; prohibido en producción)                    |
| `VAPID_PUBLIC_KEY`  | Con `webpush` | —          | Clave pública (`npm run push:keys`). La API se la da al navegador                       |
| `VAPID_PRIVATE_KEY` | Con `webpush` | —          | **Secreta.** Cambiarla invalida todas las suscripciones: generarla una vez por ambiente |
| `VAPID_SUBJECT`     | Con `webpush` | —          | Contacto para los servicios de push: `mailto:soporte@<dominio>` o una URL https         |

Guía para el frontend (service worker, permisos, iPhone): `docs/push.md`.

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

Se agregan con su etapa y se documentan acá: proveedor real de email, pagos (9). Lista propuesta: plan §15.2.
