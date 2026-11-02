# Variables de entorno

La app valida el entorno al iniciar (`src/config/env.validation.ts`). Si falta una variable o es inválida, **no arranca** y el error muestra el nombre de la variable y la regla incumplida, nunca su valor.

## Archivos

| Archivo                   | ¿Se versiona? | Uso                                                                                                               |
| ------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `.env.example`            | Sí            | Plantilla con todas las variables, sin valores reales                                                             |
| `.env.development`        | Sí            | Valores de desarrollo **sin secretos**                                                                            |
| `.env.development.local`  | No            | Tus secretos locales (a partir de la etapa 4: base de datos, JWT, etc.). Tiene prioridad sobre `.env.development` |
| `.env.test`               | Sí            | Valores para Jest                                                                                                 |
| `.env.production.example` | Sí            | Referencia para cargar en Railway. En producción no se leen archivos: todo viene del panel                        |
| `.env`                    | No            | Solo para Docker Compose (`POSTGRES_PASSWORD`, puerto del host)                                                   |

La app lee `.env.<NODE_ENV>.local` y después `.env.<NODE_ENV>`. Las variables del sistema operativo tienen prioridad sobre los archivos.

## Variables (etapa 3)

| Variable           | Obligatoria | Defecto | Descripción                                                                                                           |
| ------------------ | ----------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | Sí          | —       | `development`, `test` o `production`                                                                                  |
| `PORT`             | No          | `3001`  | Puerto HTTP (Next.js usa el 3000)                                                                                     |
| `API_PREFIX`       | No          | `api`   | Prefijo global; la versión va por URI: `/api/v1/...`                                                                  |
| `FRONTEND_ORIGINS` | Sí          | —       | Orígenes exactos del frontend separados por coma. Sin comodines, sin path ni barra final. En producción, solo `https` |
| `TRUST_PROXY`      | No          | `0`     | Cantidad de proxies delante de la API (Railway: `1`). Afecta la IP que ven el rate limit y los logs                   |
| `BODY_LIMIT`       | No          | `100kb` | Tamaño máximo del body JSON/urlencoded                                                                                |
| `SWAGGER_ENABLED`  | No          | `false` | Publica `/api/docs`. **Prohibido en producción** (la validación lo rechaza)                                           |
| `LOG_LEVEL`        | No          | `info`  | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent`                                                         |
| `THROTTLE_TTL_MS`  | No          | `60000` | Ventana del rate limit global (ms)                                                                                    |
| `THROTTLE_LIMIT`   | No          | `100`   | Requests por IP en esa ventana                                                                                        |

## Docker Compose (`.env`)

| Variable             | Defecto         | Descripción                                                       |
| -------------------- | --------------- | ----------------------------------------------------------------- |
| `POSTGRES_PASSWORD`  | — (obligatoria) | Contraseña del PostgreSQL local                                   |
| `POSTGRES_USER`      | `nexo`          | Usuario                                                           |
| `POSTGRES_DB`        | `nexo_dev`      | Base                                                              |
| `POSTGRES_HOST_PORT` | `5433`          | Puerto en tu máquina (solo `127.0.0.1`). Cambialo si está ocupado |

## Próximas etapas

Se agregan con su etapa y se documentan acá: base de datos (4), JWT, cookies, CSRF y `FRONTEND_URL` (5), almacenamiento, email, pagos e identidad (7 y 9). Lista propuesta: plan §15.2.
