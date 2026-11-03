# Operación: despliegue, backups, monitoreo e incidentes

Guía para poner y mantener la API en producción (etapa 12). Las cuentas y credenciales que faltan
están en [`decisions/pendientes.md`](decisions/pendientes.md). Las variables, en [`env.md`](env.md).

## 1. Arquitectura de producción

```
https://<dominio>            → frontend (Vercel)
https://api.<dominio>        → esta API (Railway, una instancia)
Railway, red privada         → PostgreSQL 17 (sin acceso público)
Railway, servicio programado → backup diario cifrado → Cloudflare R2
Cloudinary · Mercado Pago · proveedor de email · Sentry · monitor de uptime
```

- **Dominio propio con subdominios** (SEG §22.1): frontend y API en el mismo sitio, cookies
  `SameSite=Lax` sin problemas. `FRONTEND_ORIGINS` y `FRONTEND_URL` con `https://<dominio>`.
- **Una sola instancia de la API.** El límite de pedidos, el conteo de fallos para el CAPTCHA, los
  contadores de alertas y el tiempo real (Socket.IO) viven en memoria. Para escalar a más de una
  instancia hace falta Redis (adaptador de Socket.IO y almacenamiento del límite de pedidos): es
  una decisión pendiente, no un cambio de configuración.
- **Staging separado** (SEG §22.4): mismo esquema en otro proyecto de Railway, con su propia base y
  datos falsos, sus propias claves y `PAYMENTS_PROVIDER=mercadopago` con credenciales **de prueba**.
  Nunca se copian datos reales de producción a staging.

## 2. Primer despliegue en Railway

1. **Proyecto y base.** Crear el proyecto, agregar PostgreSQL 17 y dejarlo sin dominio público.
2. **Roles de la base** (SEG §3.1). Con el usuario dueño que crea Railway (lo usan solo las
   migraciones), crear el rol de la app con mínimo privilegio, igual que
   `docker/postgres/init/01-roles-y-base-de-test.sh`:
   - `nexo_app` con `LOGIN` y contraseña propia, sin superusuario;
   - `GRANT USAGE ON SCHEMA public` y `ALTER DEFAULT PRIVILEGES … GRANT SELECT, INSERT, UPDATE,
DELETE ON TABLES` y `USAGE, SELECT ON SEQUENCES` para las tablas que creen las migraciones;
   - después de la primera migración: `REVOKE UPDATE, DELETE ON admin_audit_logs FROM nexo_app`.
3. **Servicio de la API** desde este repositorio (usa el `Dockerfile`). Variables:
   - `DATABASE_URL` con `nexo_app` y `DATABASE_MIGRATIONS_URL` con el usuario dueño (red privada);
   - `NODE_ENV=production`, `TRUST_PROXY=1`, `COOKIE_SECURE=true`, `SWAGGER_ENABLED=false`;
   - las claves (`JWT_ACCESS_SECRET`, `CSRF_SECRET`, `DATA_ENCRYPTION_KEY`, `DATA_HMAC_KEY`)
     generadas al azar, **distintas de las de staging**;
   - las de cada proveedor (ver `env.md`). La API no arranca si falta algo obligatorio;
   - las claves de push, generadas una sola vez por ambiente con `npm run push:keys`
     (`PUSH_PROVIDER=webpush`; cambiar la privada después obliga a todos a reactivar los avisos).
4. **Migraciones como paso del deploy** (no al arrancar la app). En el servicio de la API,
   comando previo al deploy (_pre-deploy command_):
   `npx typeorm migration:run -d dist/database/data-source.js`
   y una sola vez: `node dist/database/seeds/run-catalog-seed.js`.
5. **Admin:** desde la consola del servicio, `node dist/auth/cli/create-admin.js` (muestra la
   contraseña, el secreto TOTP y los códigos de recuperación una sola vez).
6. **Dominio:** `api.<dominio>` al servicio de la API; Railway gestiona el certificado.
7. **Verificar:** `GET https://api.<dominio>/api/v1/health/ready` responde 200.

### Cloudflare delante de la API (ciudad aproximada, ADR 0031)

Opcional: sin esto, el email de dispositivo nuevo dice "ubicación no disponible".

1. Pasar el DNS del dominio a Cloudflare y crear `api` como CNAME al dominio de Railway,
   **con proxy** (nube naranja). SSL/TLS en modo _Full (strict)_.
2. _Rules → Managed Transforms_: activar **Add visitor location headers** (`cf-ipcity`,
   `cf-region`, `cf-ipcountry`).
3. _Rules → Transform Rules → Modify Request Header_, para el host `api.<dominio>`: agregar
   `x-nexo-edge-secret` con un valor al azar de 32 caracteres o más. El mismo valor va en
   `CLOUDFLARE_EDGE_SECRET`. Sin ese encabezado la API ignora la ciudad (cualquiera puede inventar
   `cf-ipcity` llamando directo a Railway).
4. **Solo se entra por Cloudflare (decidido el 03/11/2026, obligatorio antes de producción).** Si
   alguien llega directo a Railway salteando Cloudflare, puede inventar su IP (y con ella el límite
   por IP y la auditoría). Forma recomendada:
   - **Cloudflare Tunnel:** un servicio `cloudflared` dentro del proyecto de Railway que conecta
     `api.<dominio>` con la API por la red privada (`<servicio>.railway.internal`). La API se queda
     **sin dominio público** en Railway (ni `*.up.railway.app` ni dominio propio): no hay por dónde
     entrar salteando Cloudflare.
   - **Segunda capa en la API:** rechazar con 403 toda request sin `x-nexo-edge-secret` válido cuando
     `CLOUDFLARE_EDGE_SECRET` está configurado (salvo `/health/live`, que usa Railway por dentro).
     Se implementa antes de producción (pendiente).
   - **`TRUST_PROXY`:** con el túnel, la API recibe la IP real de Cloudflare a través de `cloudflared`;
     el valor exacto se fija **probándolo en staging** (los e2e de límite por IP y la auditoría deben
     ver la IP del visitante, no la de Cloudflare ni la del túnel).
   - El monitor de uptime consulta `https://api.<dominio>/...`, así que también pasa por Cloudflare.
5. Verificar: iniciar sesión desde otro navegador y revisar que el email traiga la ciudad; y que una
   request directa a Railway (si quedó algún dominio público) responda 403.

### Volver atrás un deploy

Railway permite volver al deploy anterior desde el panel. Si el deploy incluía una migración, antes
de volver: `npx typeorm migration:revert -d dist/database/data-source.js` (todas tienen `down`
probado en la CI). Si la migración borró datos, restaurar un backup (sección 4).

## 3. Tareas programadas

Corren dentro de la API. Todas menos las alertas usan un lock de PostgreSQL por si hubiera dos
instancias (las alertas cuentan en la memoria de cada una):

| Tarea                   | Cuándo          | Qué hace                                                                                                          |
| ----------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Purga de cuentas        | 3:00            | Anonimiza las bajas con la gracia vencida                                                                         |
| Limpieza de sesiones    | 4:00            | Borra sesiones vencidas (dispositivo vencido y +30 días), enlaces usados o vencidos (+7) y pedidos de Google (+1) |
| Pruebas y recordatorios | 9:00            | Vence pruebas y manda los recordatorios de prueba y de vencimiento                                                |
| Archivos                | cada hora       | Descarta subidas abandonadas y reintenta borrados fallidos en el almacenamiento                                   |
| Períodos pagos          | cada hora (:05) | Vence períodos y aplica cambios de plan programados                                                               |
| Sanciones               | cada hora (:10) | Levanta suspensiones y perfiles ocultos con fecha de fin                                                          |
| Alertas de seguridad    | cada 15 min     | Picos de logins fallidos, bloqueos, tokens reutilizados, 401/403 y 500                                            |

Horas de Córdoba.

## 4. Backups y restauración

Dos capas (SEG §3.6):

1. **Backups de Railway.** Activarlos en la base (según el plan) y anotar la retención.
2. **Backup propio diario, cifrado, en Cloudflare R2** (`ops/backup`), independiente de Railway.

### Configurar el backup propio

1. **R2:** crear un bucket privado (por ejemplo `nexo-backups`) y un token de API con permiso de
   escritura **solo a ese bucket**. Regla de ciclo de vida: borrar objetos de más de 30 días.
2. **Frase de cifrado:** generar una de 32 caracteres o más y **guardarla fuera de Railway** (gestor
   de contraseñas). Sin ella, los backups no se pueden abrir.
3. **Servicio programado en Railway** desde este repositorio, con _Dockerfile path_
   `ops/backup/Dockerfile`, _cron schedule_ `0 6 * * *` (3:00 de Córdoba) y variables:
   `DATABASE_URL` (usuario dueño, red privada), `BACKUP_PASSPHRASE`, `BACKUP_ENV=prod`,
   `R2_BUCKET`, `R2_ENDPOINT` (`https://<cuenta>.r2.cloudflarestorage.com`), `AWS_ACCESS_KEY_ID`
   y `AWS_SECRET_ACCESS_KEY` (las del token de R2).
4. El script vuelca la base, la cifra (AES-256), **verifica que se pueda leer** y la sube. Si algo
   falla, el servicio termina con error y Railway lo marca.

### Restaurar

**Siempre primero en una base nueva o en staging.** Se restaura encima de producción solo si se
decidió, sabiendo que se pierde lo posterior al backup.

1. Crear la base destino con los mismos roles (sección 2, paso 2).
2. Con la misma imagen, correr `restore.sh` con `TARGET_DATABASE_URL` (usuario dueño),
   `BACKUP_NAME`, `BACKUP_PASSPHRASE`, `RESTORE_CONFIRM=yes` y las variables de R2. Es todo o
   nada (una transacción).
3. Verificar: `npx typeorm migration:show` (sin pendientes), `GET /health/ready` y una cuenta de
   prueba.

**Probado el 03/11/2026** con la base de desarrollo: backup cifrado, restauración en una base nueva y
comparación (mismas migraciones, filas, triggers de la auditoría y permisos del rol de la app).
**Repetir la prueba en staging antes del lanzamiento y después una vez por trimestre.**

## 5. Monitoreo

- **Caída de la app:** un monitor externo (UptimeRobot o Better Stack, plan gratuito) que consulte
  `https://api.<dominio>/api/v1/health/ready` cada minuto y avise por email y al celular si falla
  2 veces seguidas. `ready` falla también si la base no responde.
- **Errores:** Sentry. Crear un proyecto Node.js, copiar el DSN en `SENTRY_DSN`. Se mandan solo los
  errores 500 y fallas de arranque, **sin datos personales** (sin usuario, IP, cookies, cuerpos ni
  query). Configurar una alerta por email ante errores nuevos.
- **Alertas de seguridad:** llegan como notificación y email al admin (umbrales en
  `src/monitoring/security-alerts.service.ts`; se ajustan con datos reales).
- **Logs:** los de Railway (JSON de pino, sin datos sensibles). Definir la retención en Railway
  (SEG §20.3 sugiere 90 días).

## 6. Prueba de carga

`ops/load/public-read.js` (k6, desde Docker) simula 20 usuarios leyendo catálogo, foro y
profesiones durante un minuto y falla si el p95 pasa de 500 ms o hay más de 1 % de errores.
**Correrla contra staging, nunca contra producción.**

Referencia local (03/11/2026, una máquina de desarrollo, pocos datos): 4360 pedidos, 0 errores,
p95 39 ms. No es una garantía para producción: repetirla en staging con datos de prueba
representativos.

## 7. Recuperar el acceso del admin

Si se pierden el dispositivo del 2FA y los códigos de recuperación (C-34), desde la consola del
servicio de la API:

```
node dist/auth/cli/reset-admin-mfa.js --email <email del admin> --confirm
```

Genera un secreto y códigos nuevos (los muestra una vez), anula los anteriores, cierra todas las
sesiones del admin y lo audita (`ADMIN_MFA_RESET`). Solo lo puede correr quien entra al panel de
Railway: por eso el 2FA de Railway es obligatorio.

## 8. Respuesta ante incidentes (SEG §25)

1. **Detectar:** alerta de seguridad, error en Sentry, monitor de uptime o aviso de un usuario.
2. **Contener**, según el caso:
   - cuenta comprometida: `POST /admin/users/:id/revoke-sessions` (y suspender si hace falta);
   - el admin comprometido: `reset-admin-mfa` y cambio de contraseña;
   - una clave filtrada: rotarla en Railway. `JWT_ACCESS_SECRET` admite rotación sin cortar sesiones
     (`JWT_ACCESS_SECRET_PREVIOUS`); cambiar `CSRF_SECRET` obliga a volver a pedir el token;
     **`DATA_ENCRYPTION_KEY` y `DATA_HMAC_KEY` no se cambian sin un plan** (cifran el TOTP y
     seudonimizan IPs);
   - credenciales de proveedores (Mercado Pago, Cloudinary, email, Google): revocarlas en el panel
     del proveedor y cargar las nuevas.
3. **Investigar** con la auditoría (`admin_audit_logs`, append-only) y los logs. No borrar evidencia.
4. **Corregir** y desplegar; si hubo pérdida de datos, restaurar (sección 4).
5. **Avisar:** si se expusieron datos personales, la ley argentina de datos personales y la revisión
   legal definen a quién y en qué plazo. Dejarlo definido con el abogado antes del lanzamiento.
6. **Registrar** qué pasó y qué se cambió para que no se repita.

## 9. Configuración de GitHub y cuentas (una sola vez)

- **2FA** en GitHub, Railway, Vercel, Cloudflare, Sentry, el proveedor de email y el registrador
  del dominio (SEG §21). Una cuenta de deploy comprometida equivale a todo el sistema.
- **Rama `main` protegida:** pull request obligatorio y la CI (`Lint, build y tests`, `Escaneo de
secretos`, `Imagen Docker`) en verde antes de mergear.
- **Secret scanning y push protection** activados en _Settings → Code security_.
- Dependabot y CodeQL ya están configurados en el repositorio (`.github/`).
