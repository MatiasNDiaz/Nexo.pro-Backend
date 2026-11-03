# Modelo de datos

Describe las tablas **que existen hoy**. El modelo completo propuesto está en el plan (§8); cada etapa
agrega su parte y la documenta acá.

## Convenciones

| Tema            | Regla                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Esquema         | Solo cambia con migraciones escritas y revisadas a mano (`src/database/migrations/`). `synchronize: false` siempre                                                                                    |
| Nombres         | Tablas y columnas en `snake_case`. Constraints con nombre fijo: `pk_<tabla>`, `fk_<tabla>_<columnas>`, `uq_…`, `ix_…`, `ck_…` (`SnakeNamingStrategy`)                                                 |
| Ids             | `uuid` con `gen_random_uuid()` (nativo de PostgreSQL)                                                                                                                                                 |
| Fechas          | `timestamptz`, en UTC                                                                                                                                                                                 |
| Dinero          | `numeric(12,2)` + `currency char(3)`; en TypeScript es `string` para no perder precisión                                                                                                              |
| Únicos de texto | Sin distinguir mayúsculas (`lower(name)` o `citext`); barrios por nombre normalizado                                                                                                                  |
| Borrado         | Catálogos: `active = false`. Usuarios: soft delete (`deleted_at`) con anonimización (ADR 0013). Perfil profesional: `deactivated_at`. FK `RESTRICT` salvo sesiones y tokens (`CASCADE`, descartables) |
| Secretos        | Contraseñas con argon2id; refresh y enlaces de un solo uso: solo SHA-256; secreto TOTP cifrado (AES-256-GCM). **Sin DNI** (ADR 0006)                                                                  |

Un test de integración compara las entidades con el esquema real que dejan las migraciones; si alguien
cambia una entidad sin migración (o al revés), falla.

## Diagrama (etapas 4 a 8)

```mermaid
erDiagram
  provinces ||--o{ localities : "tiene"
  localities ||--o{ neighborhoods : "tiene"
  neighborhoods |o--o{ neighborhoods : "merged_into_id (alias)"
  neighborhoods |o--o{ users : "barrio donde vive (cliente)"
  users ||--o{ auth_sessions : "abre"
  users ||--o{ auth_identities : "vincula Google"
  users ||--o{ conversations : "cliente y profesional"
  conversations ||--o{ messages : ""
  messages ||--o{ message_attachments : ""
  users ||--o{ service_requests : "cliente"
  service_requests ||--|{ service_request_targets : "enviado a"
  service_request_targets ||--o{ quotes : "presupuestos"
  service_requests ||--o| service_contracts : ""
  service_contracts ||--o{ service_contract_history : "transiciones"
  users ||--o{ notifications : ""
  users |o--o{ oauth_pending_requests : "vinculación pendiente"
  auth_sessions |o--o| auth_sessions : "replaced_by_id"
  users ||--o{ one_time_tokens : "recibe"
  users ||--o| user_mfa_settings : "admin"
  users ||--o| professional_profiles : "profesional"
  professional_profiles ||--o{ professional_professions : "ofrece"
  professions ||--o{ professional_professions : ""
  professional_profiles ||--o{ professional_service_areas : "trabaja en"
  localities ||--o{ professional_service_areas : ""
  neighborhoods |o--o{ professional_service_areas : "null = toda la localidad"
  users |o--o{ admin_audit_logs : "actor"
  users ||--o{ stored_files : "sube"
  stored_files |o--o| users : "avatar_file_id"
  users ||--o{ identity_verifications : "intenta"
  identity_verifications |o--o{ identity_provider_events : "avisos del proveedor"
  users ||--o| customer_profiles : "cliente"
  professional_profiles ||--o{ professional_media : "publica"
  professional_profiles ||--o{ professional_certifications : "presenta"
  professional_profiles ||--o{ professional_social_links : ""
  professional_profiles ||--o{ availability_slots : "horario semanal"
  professional_profiles ||--o{ availability_exceptions : "días sin atención"
  stored_files ||--o| professional_media : ""
  stored_files ||--o| professional_certifications : ""
  users ||--o{ subscriptions : "profesional"
  subscription_plans ||--o{ subscriptions : ""
  subscriptions ||--o{ subscription_history : ""

  users {
    uuid id PK
    citext email "único entre no borrados"
    text password_hash "argon2id"
    user_role role
    account_status status
    verification_status verification_status
    varchar first_name
    varchar last_name
    varchar phone
    uuid neighborhood_id FK "obligatorio para clientes"
    timestamptz email_verified_at
    int failed_login_attempts
    timestamptz locked_until
    timestamptz deleted_at
  }
  neighborhoods {
    uuid id PK
    uuid locality_id FK
    varchar name
    varchar normalized_name "único por localidad"
    neighborhood_status status "PENDING APPROVED MERGED"
    uuid merged_into_id FK
    uuid created_by_user_id FK
    uuid reviewed_by_id FK
  }
  auth_sessions {
    uuid id PK "sid"
    uuid user_id FK
    uuid family_id "dispositivo"
    char refresh_token_hash UK
    timestamptz expires_at
    timestamptz family_expires_at
    timestamptz revoked_at
    session_revoke_reason revoke_reason
  }
  one_time_tokens {
    uuid id PK
    uuid user_id FK
    one_time_token_type type "EMAIL_VERIFY PASSWORD_RESET"
    char token_hash UK
    timestamptz expires_at
    timestamptz used_at
  }
  user_mfa_settings {
    uuid user_id PK
    text totp_secret_encrypted
    jsonb recovery_code_hashes
    bigint last_used_step
  }
  professional_service_areas {
    uuid id PK
    uuid professional_id FK
    uuid locality_id FK
    uuid neighborhood_id FK
  }
  stored_files {
    uuid id PK
    uuid owner_user_id FK
    varchar provider "CLOUDINARY LOCAL"
    varchar storage_key UK
    file_purpose purpose "AVATAR (7.2 suma más)"
    file_kind kind "IMAGE VIDEO"
    file_visibility visibility
    file_status status "PENDING_UPLOAD READY REJECTED DELETED"
    varchar mime_type "detectado, no declarado"
    bigint size_bytes
    int duration_ms "máximo 15,5 s"
  }
  identity_verifications {
    uuid id PK "generado en la app"
    uuid user_id FK
    verification_status status
    varchar provider
    varchar provider_reference
    smallint attempt_number
    verification_decision_source decision_source
    varchar reason_code
    varchar admin_note "interna"
    uuid decided_by FK
  }
  identity_provider_events {
    uuid id PK
    varchar provider
    varchar event_id "único con provider"
    uuid verification_id FK
    timestamptz processed_at
  }
```

Las tablas de la etapa 4 (`provinces`, `localities`, `professions`, `subscription_plans`,
`admin_audit_logs`) mantienen las columnas descritas abajo.

## Tablas

| Tabla                         | Para qué                                                                                                               | Integridad en la base                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `provinces`, `localities`     | Ubicaciones que habilita el admin                                                                                      | Únicos por nombre sin mayúsculas; FK `RESTRICT`; coordenadas ambas o ninguna, en rango                                          |
| `neighborhoods`               | Barrios creados por los usuarios (ADR 0010)                                                                            | Nombre normalizado único por localidad (incluye alias fusionados); `merged_into_id` si y solo si `MERGED`; no apunta a sí mismo |
| `professions`                 | Catálogo único de oficios (lo administra el admin)                                                                     | `slug` único con formato `minúsculas-con-guiones`; nombre único sin mayúsculas                                                  |
| `subscription_plans`          | **Única fuente** de precios y límites de plan                                                                          | `code` único; precio ≥ 0; moneda de 3 letras mayúsculas; límites no negativos y al menos 1 profesión                            |
| `users`                       | Identidad y credenciales                                                                                               | Email único entre no borrados (`citext`); intentos fallidos ≥ 0; un cliente tiene barrio                                        |
| `auth_sessions`               | Una fila por refresh token; la familia es el dispositivo                                                               | Hash único; `replaced_by_id` encadena las rotaciones                                                                            |
| `one_time_tokens`             | Enlaces de un solo uso                                                                                                 | Hash único; el consumo es un `UPDATE … WHERE used_at IS NULL AND expires_at > now()` atómico                                    |
| `user_mfa_settings`           | TOTP del admin                                                                                                         | Uno por usuario                                                                                                                 |
| `professional_profiles`       | Perfil profesional (mínimo hasta la etapa 7). `deactivated_at` si el usuario cambió de rol o se dio de baja (ADR 0012) | Uno por usuario                                                                                                                 |
| `professional_professions`    | Oficios del profesional                                                                                                | Una sola principal por profesional (índice parcial)                                                                             |
| `professional_service_areas`  | Zonas de trabajo (1 a 20)                                                                                              | El barrio pertenece a la localidad (FK compuesta); sin zonas repetidas (`NULLS NOT DISTINCT`)                                   |
| `stored_files`                | Metadatos de archivos (ADR 0018); el binario está en Cloudinary (o en disco en desarrollo)                             | `storage_key` único; READY exige tipo y peso; duración ≤ 15,5 s; índice parcial de pendientes para la limpieza                  |
| `identity_verifications`      | Intentos de verificación de identidad (ADR 0003). Sin imágenes ni datos biométricos                                    | Un solo intento abierto por usuario (índice único parcial); `(user_id, attempt_number)` único; referencia del proveedor única   |
| `identity_provider_events`    | Webhooks recibidos del proveedor                                                                                       | `(provider, event_id)` único: idempotencia                                                                                      |
| `customer_profiles`           | Datos del cliente que no son de identidad (`extra_info`, 300)                                                          | Uno por usuario                                                                                                                 |
| `professional_media`          | Imágenes, videos y banner del perfil (FI §6.3)                                                                         | Archivo único; posición ≥ 0; oculto por el admin exige fecha y motivo. Cantidades según el plan (en el servicio)                |
| `professional_certifications` | Certificados (ADR 0020): públicos al subirlos, "cargados por el profesional"                                           | Archivo único; `sensitive_data_confirmed_at` obligatorio; año entre 1950 y 2100; máximo 10 (en el servicio)                     |
| `professional_social_links`   | Redes del profesional                                                                                                  | Una por red; solo `https://` (el dominio de cada red se valida en el servicio)                                                  |
| `availability_slots`          | Horario semanal (hora de Córdoba)                                                                                      | Día 1 a 7; inicio antes del fin. Sin superposiciones (en el servicio)                                                           |
| `availability_exceptions`     | Días sin atención (descanso, feriado, vacaciones)                                                                      | Fin ≥ inicio                                                                                                                    |
| `subscriptions`               | Prueba de 30 días y planes pagos (`TRIAL`, `ACTIVE`, `EXPIRED`, ADR 0026)                                              | **Una viva por usuario** (índice único parcial); `TRIAL` exige `trial_ends_at`; recordatorio 7, 3 o 1; lo pagado ≥ 0            |
| `subscription_history`        | Historial de la suscripción (ver `SubscriptionHistoryEvent`: prueba, pagos, mejoras, vencimientos, reversiones, admin) | Solo inserciones                                                                                                                |
| `payments`                    | Pagos con Mercado Pago (ADR 0026): copia del importe y lo que dio cada pago                                            | Id del pago en Mercado Pago único; importe > 0; tramo dado completo y en orden; revertido solo si se aplicó                     |
| `payment_events`              | Avisos de Mercado Pago, sin datos personales                                                                           | `(provider, provider_event_id)` único: idempotencia                                                                             |
| `admin_audit_logs`            | Acciones administrativas y eventos de seguridad                                                                        | **Append-only**: un trigger rechaza `UPDATE`, `DELETE` y `TRUNCATE`; el rol de runtime solo tiene `SELECT` e `INSERT`           |

Eventos auditados hoy: `USER_REGISTERED`, `ACCOUNT_LOCKED`, `REFRESH_TOKEN_REUSE`, `ADMIN_LOGIN`,
`ADMIN_LOGIN_RECOVERY_CODE`, `ADMIN_PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`,
`PASSWORD_CHANGED`, `ADMIN_CREATED`, `ACCOUNT_SUSPENDED`, `ACCOUNT_BANNED`, `ACCOUNT_RESTORED`,
`ROLE_CHANGED` (con rol de origen y destino: reemplaza a la tabla `role_changes` del plan),
`SESSIONS_REVOKED`, `ACCOUNT_DELETION_SCHEDULED`, `ACCOUNT_ANONYMIZED`,
`IDENTITY_VERIFICATION_APPROVE` / `_REJECT` / `_REVOKE` (también los intentos denegados, con
resultado `DENIED`), `NEIGHBORHOOD_APPROVED`, `NEIGHBORHOOD_RENAMED` y `NEIGHBORHOOD_MERGED` (con
cuántos clientes y zonas se movieron).

`users.avatar_file_id`: foto de perfil (paso 2 del registro, ADR 0006). `users.pending_avatar_file_id`: foto nueva en revisión con la identidad aprobada; `identity_verifications.kind = AVATAR_CHANGE` es esa revisión (ADR 0019).

`professional_profiles` (etapa 7.2): `slug` único para la URL pública, descripción de hasta 200, tarifa de referencia con su modalidad (las dos o ninguna), estado de atención manual con vencimiento y opción automática por horario (el estado que se muestra se calcula al leerlo) y `theme` con valores de listas cerradas. `subscription_plans` suma `max_image_bytes` y `max_video_bytes` (ADR 0018).

`users.password_hash` es opcional desde la etapa 7B (cuentas creadas con Google, ADR 0023); `ck_users_admin_password` obliga al admin a tener contraseña.

`users.pending_first_name` / `pending_last_name` (etapa 7.3, ADR 0021): nombre nuevo en revisión, los dos o ninguno. La revisión `AVATAR_CHANGE` pasó a llamarse `PROFILE_CHANGE` y cubre foto y nombre.

Eventos auditados nuevos: `GOOGLE_LINKED`, `GOOGLE_UNLINKED`, `PASSWORD_SET`, `USER_REGISTERED` con `via` (`PASSWORD` o `GOOGLE`), `USER_DATA_UPDATED` y `PROFESSIONAL_PROFILE_UPDATED` (solo los nombres de los campos, no los valores), `PROFESSIONAL_MEDIA_HIDDEN` / `_RESTORED` y `PROFESSIONAL_CERTIFICATION_HIDDEN` / `_RESTORED`.

Etapa 9 (ADR 0026): `subscription_status` pierde `CANCEL_AT_PERIOD_END` y `PAST_DUE` (sin débito automático no hay cancelación ni deuda). `subscriptions.last_trial_reminder_days` pasa a `last_reminder_days` (prueba y período pago) y suma `period_amount_paid` (base de la diferencia de mejora). `current_period_start` / `current_period_end` son el tramo pago sin cortes, incluidos los meses pagados por adelantado. El estado de la suscripción se recalcula desde los pagos aplicados y no revertidos (`src/payments/subscription-ledger.ts`): revertir un pago es sacarlo de la cuenta. Eventos auditados nuevos: `PAYMENT_MISMATCH`, `PAYMENT_NOT_APPLICABLE`, `PAYMENT_UNKNOWN`, `PAYMENT_DUPLICATE_CHARGE` (resultado `FAILED`), `PAYMENT_REVERTED` y `SUBSCRIPTION_PLAN_CHANGED`.

Al anonimizar una cuenta, sus
archivos pasan a `DELETED` y se borran del proveedor.

`users.deletion_scheduled_for`: fecha en que se anonimiza una cuenta dada de baja (30 días de gracia, ADR 0016).

`users.status_reason` guarda el motivo de una suspensión o baneo para mostrárselo al usuario
(ADR 0007); en la etapa 11 lo complementan las sanciones. Las cuentas dadas de baja pueden quedar sin
barrio aunque sean clientes (`ck_users_customer_neighborhood` lo contempla).

## Datos iniciales (`npm run seed:catalogs`)

Idempotente (`ON CONFLICT DO NOTHING`): no duplica y **no pisa** cambios del admin.

| Catálogo    | Contenido                                                                       | Estado                                                          |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Ubicaciones | Córdoba → Córdoba (capital). **Sin barrios**: los crean los usuarios (ADR 0010) | Sin coordenadas. Faltan las demás localidades                   |
| Oficios     | 10 oficios comunes                                                              | **De ejemplo**; el catálogo final lo define el admin            |
| Planes      | Basic $10.000 · Medium $15.000 · Premium $20.000 (ARS, impuestos incluidos)     | Precios de referencia a confirmar. Límites en la tabla de abajo |

| Límite                   | Basic  | Medium             | Premium                |
| ------------------------ | ------ | ------------------ | ---------------------- |
| Profesiones              | 1      | 2                  | 3                      |
| Imágenes                 | 5      | 5                  | 5                      |
| Videos (máx. 15 s)       | 0      | 1                  | 2                      |
| Personalización          | `NONE` | `STANDARD`         | `EXTENDED`             |
| Ranking (`ranking_tier`) | 0      | 1                  | 2                      |
| Avisos de disponibilidad | No     | Sí                 | Sí, con mensaje propio |
| Métricas                 | No     | No (sin confirmar) | Sí                     |
| Chatbot                  | No     | No                 | Sí                     |

## Roles de base de datos

| Rol                           | Uso                                                             | Permisos                                                                                                        |
| ----------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Dueño (`nexo` en local)       | Migraciones, seeds y `admin:create` (`DATABASE_MIGRATIONS_URL`) | DDL sobre el esquema                                                                                            |
| Runtime (`nexo_app` en local) | La API (`DATABASE_URL`)                                         | `SELECT/INSERT/UPDATE/DELETE` sobre las tablas; nada de DDL ni `TRUNCATE`; solo `SELECT/INSERT` en la auditoría |

En local los crea `docker/postgres/init/`. En Railway hay que crear el rol de runtime a mano si el plan
lo permite (ver `docs/env.md`); aunque no se pueda, el trigger mantiene la auditoría append-only.
