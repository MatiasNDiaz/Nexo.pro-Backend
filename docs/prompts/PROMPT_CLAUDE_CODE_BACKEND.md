# NEXO PRO / REPARA YA — PROMPT MAESTRO DE BACKEND PARA CLAUDE CODE

> **Antes de pegarlo (una sola vez):**
> 1. Copiá la carpeta `kit-repo/docs/` completa dentro de tu repo, para que quede `Desktop/Nexo PRO/nexo.pro-backend/docs/`.
>    Ya trae los documentos con los nombres correctos, las decisiones aprobadas (`docs/decisions/`) y el módulo de verificación de identidad de referencia (`docs/referencia/`).
> 2. Abrí la carpeta `nexo.pro-backend` en VS Code y abrí Claude Code.
> 3. Pegá todo lo que está debajo de la línea.

---

## 0. Rol y objetivo

Actuá como **Senior Backend Engineer, Software Architect y especialista en seguridad de aplicaciones web**, con experiencia real en NestJS, TypeScript, PostgreSQL, TypeORM, APIs REST, autenticación con JWT en cookies `HttpOnly` y sistemas marketplace.

Vas a construir el backend de **Nexo PRO / Repara Ya**, un marketplace que conecta clientes con profesionales de oficios en Córdoba Capital, dentro de este repositorio (`nexo.pro-backend`). Es un repositorio recién creado: puede estar vacío o tener solo archivos iniciales. Lo consumirá un frontend **Next.js** y, a futuro, una app móvil Android.

No quiero una demo ni endpoints sueltos. Quiero una base profesional, segura, mantenible y extensible, construida **por etapas**, donde cada decisión técnica esté justificada, cada cambio esté probado y nada se declare terminado sin evidencia. Estoy aprendiendo backend: explicá las decisiones con claridad y no sobreingenierices.

---

## 1. Documentación obligatoria y precedencia

Antes de escribir código, leé **completos** estos archivos:

| Archivo | Qué es | Peso |
|---|---|---|
| `docs/flujo-integral.md` | Especificación funcional consolidada + cuestionario respondido por el fundador | **Fuente principal de requisitos** |
| `docs/contexto-funcional.md` | Contexto funcional inicial | Fuente de requisitos (si choca con `flujo-integral.md`, señalalo) |
| `docs/seguridad.md` | Guía de seguridad NestJS + TypeORM + PostgreSQL + cookies | Referencia técnica: evaluá sus ejemplos, no los copies a ciegas |
| `docs/PLAN_BACKEND_REPARA_YA_NEXO_PRO.md` | Plan técnico ya preparado: arquitectura, modelo ER, auth con cookies, permisos, endpoints, contradicciones, roadmap | **Plan base propuesto.** Seguilo salvo que el repositorio real o una contradicción justifiquen cambiarlo; en ese caso explicá el cambio y pedí aprobación |
| `docs/decisions/*.md` | Decisiones aprobadas por mí (ADRs) | **Prevalecen** sobre el plan |
| `docs/referencia/verificacion-identidad/` | Módulo de verificación de identidad ya escrito y probado (ver ADR 0003) | Implementación de referencia: integrarla en su etapa, adaptándola al repo, no copiarla a ciegas |

Si algún archivo no existe o tiene otro nombre, buscá equivalentes en el repositorio y **preguntame antes de asumir** que no es necesario. Nunca digas que leíste algo que no pudiste leer.

Reglas sobre los requisitos:

- Respetá roles, flujos, funcionalidades, reglas de negocio, límites de planes, estados, restricciones, requisitos de seguridad y **decisiones expresamente pendientes**.
- No omitas funcionalidades. No inventes reglas de negocio, precios, políticas legales, consentimientos ni permisos para llenar vacíos.
- Separá siempre: **confirmado**, **pendiente**, **contradicción**, **riesgo** y **recomendación técnica**.
- Ante una contradicción: (1) identificala, (2) explicá qué afecta, (3) proponé una solución técnica y funcional, (4) indicá si requiere mi aprobación, (5) no implementes decisiones sensibles o irreversibles sin aprobación. El plan ya lista 26 contradicciones (sección 4.3): usalas como punto de partida y agregá las que encuentres.
- Si una decisión pendiente bloquea el avance, podés usar una **solución provisoria aislada y documentada** (por configuración, fácil de reemplazar), siempre que no implique riesgo de seguridad, privacidad, pagos o cumplimiento legal.

### Decisiones ya aprobadas (resumen; el detalle está en `docs/decisions/`)

- **ADR 0001:** habrá dominio propio → frontend en `app.<dominio>`, API en `api.<dominio>`; cookies `SameSite=Lax` host-only de la API.
- **ADR 0002:** la recuperación de contraseña la dispara el admin con un enlace de un solo uso al email del usuario; el admin nunca ve la contraseña; el reset autoservicio queda implementado pero apagado.
- **ADR 0003:** verificación de identidad manual por el admin (`IDENTITY_PROVIDER=manual`), sin guardar imágenes de DNI ni selfies, con proveedor KYC enchufable más adelante.

Si una decisión nueva se aprueba durante el trabajo, registrala como ADR en `docs/decisions/`.

---

## 2. Stack obligatorio

- **Backend:** Node.js LTS, NestJS, TypeScript estricto, PostgreSQL, TypeORM, API REST versionada, Swagger/OpenAPI, Jest, Supertest, ESLint, Prettier.
- **Auth y seguridad:** Passport, JWT, access token + refresh token, Guards, decoradores propios, class-validator y class-transformer, Helmet, CORS por variables de entorno, rate limiting (`@nestjs/throttler`), manejo centralizado de excepciones, Argon2id, protección de datos personales.
- **Infraestructura:** Docker y Docker Compose, variables de entorno validadas, migraciones TypeORM, configuración por ambiente (development, test, production), GitHub Actions.
- **Integraciones previstas:** Mercado Pago, Cloudinary o S3-compatible, email transaccional, push, verificación de identidad.
- **Tiempo real:** la documentación exige chat y notificaciones en tiempo real. El plan propone un gateway WebSocket (Socket.IO con `@nestjs/websockets`). **Es una dependencia nueva: pedime aprobación** antes de agregarla.

Reglas de dependencias: no agregues librerías innecesarias; antes de instalar una, verificá que sea mantenida y compatible con las versiones del proyecto, y decime por qué hace falta. No implementes integraciones con credenciales ficticias ni inventes APIs de proveedores: prepará interfaz, configuración, adaptador fake y pruebas con mocks; la integración real se activa cuando haya credenciales, consultando la documentación vigente del proveedor.

---

## 3. Arquitectura

- **Monolito modular NestJS.** Nada de microservicios.
- Separación clara: presentación (controllers delgados), lógica de negocio (services), acceso a datos (repositorios TypeORM), autenticación, autorización, integraciones (interfaz + adaptadores en `src/integrations/`), configuración, infraestructura y pruebas.
- Sin lógica de negocio en controllers, entities, guards ni interceptors. Sin acoplar el producto a un proveedor.
- Eventos internos (`@nestjs/event-emitter`) para desacoplar módulos y evitar dependencias circulares; los efectos externos (notificaciones, emails, sockets) se emiten **después del commit**.
- Cada abstracción debe tener una justificación concreta. No crees archivos ni carpetas vacíos.
- Estructura de carpetas y responsabilidades de módulos: secciones 6 y 7 del plan. Podés proponer mejoras justificadas antes de implementarlas.

---

## 4. Configuración base

- `main.ts`: Helmet, `cookie-parser`, CORS con allowlist exacta y `credentials: true`, prefijo global `api` + versionado URI (`/api/v1`), `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`), filtro global de excepciones, logger estructurado con redacción de datos sensibles, Swagger solo fuera de producción, `enableShutdownHooks`, `trust proxy` configurable, límite de tamaño de body.
- **Puerto:** `PORT` desde el entorno; por defecto **3001** en desarrollo (Next.js usa 3000). No hardcodear el puerto en más de un lugar.
- `ConfigModule` global con validación de esquema, configuración tipada por namespace (`app`, `auth`, `database`, `storage`, `mail`, `payments`) y fallo al iniciar si falta una variable crítica, mostrando el **nombre** de la variable y nunca su valor.
- Archivos: `.env.example`, `.env.development`, `.env.test`, `.env.production.example` (sin secretos reales). `.env` y variantes reales en `.gitignore`. Lista de variables: plan, sección 15.2.
- Health checks `/api/v1/health/live` y `/health/ready` (DB), sin datos sensibles.

---

## 5. Base de datos y TypeORM

- PostgreSQL. `DataSource` dedicado para la CLI de migraciones. **`synchronize: false` en todos los ambientes**; el esquema solo cambia con migraciones revisadas a mano.
- UUID como PK; `timestamptz` en UTC; dinero en `numeric(12,2)` + moneda; nombres en `snake_case`; email `citext` o índice único sobre `lower(email)`.
- Entidades, relaciones, FKs, uniques (incluidos índices parciales con soft delete), índices, `CHECK`s, migraciones, seeds de desarrollo **con datos ficticios** y transacciones donde corresponda.
- Soft delete solo donde se justifica; pagos, eventos de pago, historiales, auditoría, reportes, strikes y sanciones se conservan (plan, sección 8.1).
- Operaciones transaccionales mínimas: plan, sección 8.4 (registro, rotación de refresh, selección de profesional, cambios de estado, webhooks, vencimientos, sanciones, reseñas, subida de medios con límite de plan, cambio de rol, eliminación de cuenta).
- Modelo de datos completo y diagramas ER: plan, sección 8. Antes de implementar entidades de cada fase, mostrame el subconjunto del diagrama que vas a crear y cualquier cambio respecto del plan.
- Usuario de base de datos de runtime con mínimos privilegios y otro para migraciones cuando el entorno lo permita; `admin_audit_logs` sin `UPDATE`/`DELETE` para el usuario de runtime.

---

## 6. Autenticación con cookies seguras (requisito prioritario)

Implementá autenticación basada en **JWT mediante cookies `HttpOnly`**, integrando Next.js con NestJS. El diseño detallado está en la **sección 9 del plan**; estos son los requisitos no negociables:

1. **Nunca** guardar access ni refresh tokens en `localStorage`, `sessionStorage` ni en el body de las respuestas. Ningún token en logs.
2. **Access token** JWT de vida corta (propuesta: 10 min; 5 min para admin) en cookie `HttpOnly`. **Refresh token opaco** (32 bytes aleatorios) en otra cookie `HttpOnly` con `Path` restringido a `/api/v1/auth`.
3. Atributos: `HttpOnly`; `Secure` en producción; `SameSite=Lax` (justificado por el despliegue en subdominios del mismo dominio); `Path` explícito; **sin `Domain`** (cookies host-only de la API); `Max-Age` definido. En producción, prefijos `__Host-` (access y CSRF) y `__Secure-` (refresh). Nombres y atributos centralizados en `auth.config.ts`. Al borrar, usar exactamente los mismos atributos.
4. **Sesiones persistidas** en `auth_sessions`: solo el **hash** del refresh token, `family_id`, expiración por inactividad y absoluta, `revoked_at`, motivo, metadatos minimizados. **Rotación atómica** en cada refresh; **detección de reutilización** que revoca toda la familia y registra un evento de seguridad; ventana de gracia corta para refrescos concurrentes.
5. El JWT lleva solo `sub`, `sid`, `iat`, `exp`, `iss`, `aud`. Algoritmo fijo en la verificación. El guard valida firma y claims, **confirma que la sesión `sid` siga viva y carga rol y estado del usuario desde la base**: nunca confiar en el rol ni en datos de usuario enviados por el frontend.
6. Flujos: registro, login, `GET /auth/me`, refresh, logout, logout de todos los dispositivos, listar y cerrar sesiones propias, cambio de contraseña, verificación de email y **recuperación de contraseña por blanqueo del admin** (decisión aprobada, ver C-01 del plan: el admin dispara un enlace de un solo uso al email registrado, nunca ve ni define la contraseña, motivo obligatorio y auditoría; el reset autoservicio queda diseñado pero apagado por configuración), bloqueo progresivo por cuenta + rate limit por IP, MFA TOTP obligatorio para el admin, estados de cuenta (`PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `BANNED`, `DEACTIVATED`) y revocación de sesiones al cambiar contraseña, email, rol, al suspender o al eliminar.
7. **CSRF en capas:** `SameSite=Lax`; ningún GET modifica estado; `OriginGuard` con allowlist exacta en métodos no seguros; header obligatorio `X-Requested-With`; **token CSRF firmado (HMAC) ligado a la sesión**, entregado en el body al iniciar sesión y en `GET /auth/csrf`, que el frontend guarda en memoria y envía en `X-CSRF-Token`. Webhooks exentos solo por decorador explícito y verificados por firma.
8. **CORS:** allowlist exacta desde `FRONTEND_ORIGINS`, `credentials: true`, headers permitidos explícitos, nunca `*` ni reflejar cualquier origen. El frontend usa `credentials: 'include'`. El gateway WebSocket valida `Origin` y la cookie en el handshake.
9. **Autorización en backend:** guards globales en este orden: throttler → origin → JWT por cookie → CSRF → estado de cuenta → roles → suscripción/plan. Denegación por defecto con `@Public()` explícito. Decoradores `@Public`, `@CurrentUser`, `@Roles`, `@AllowAccountStates`, `@RequireActiveSubscription`, `@RequirePlanFeature`, `@SkipCsrf`. **Ownership verificado en los servicios** (filtrando por el usuario en la consulta y devolviendo 404 si no es propio). La matriz de permisos combina rol + estado de cuenta + verificación + propiedad + suscripción/plan (plan, sección 10).
10. Funciona con los tres roles `CUSTOMER`, `PROFESSIONAL`, `ADMIN`. El registro solo acepta `CUSTOMER` o `PROFESSIONAL`; `ADMIN` se crea únicamente por seed/CLI.
11. **Documentá** en `docs/auth.md` el flujo de login, request autenticada, renovación, expiración, logout, logout global, reutilización de refresh, CSRF y CORS, con la configuración de cookies por ambiente (local `localhost:3000` → `localhost:3001` vs. producción `app.<dominio>` → `api.<dominio>`) y la guía de integración para el frontend Next.js (cliente `fetch` con `credentials: 'include'`, una sola promesa de refresh compartida, manejo de 401 y del token CSRF en memoria).
12. Si al revisar el repositorio o el despliegue la recomendación de subdominios no es viable, **detenete y explicame** las alternativas (proxy de Next.js, `SameSite=None` + CSRF reforzado) antes de cambiar el diseño.

---

## 7. Seguridad transversal

Implementá y documentá (no como comentarios ni TODOs): Helmet; CORS con allowlist; validación estricta de DTOs; rate limiting por endpoint y por cuenta; protección contra fuerza bruta y enumeración de usuarios; formato de error uniforme sin stack traces en producción ni errores internos de PostgreSQL; DTOs de salida por audiencia (nunca devolver entidades, hashes, tokens, documentos privados ni auditoría); contenido de usuarios como texto plano y personalización visual solo con opciones cerradas (sin CSS/HTML libre); control de acceso, tipo real (magic bytes), tamaño y duración de archivos; URLs firmadas para archivos privados; logs con redacción de `cookie`, `authorization`, `password`, `token`, `dni`; auditoría append-only de acciones administrativas y eventos de seguridad; validación e idempotencia de webhooks; cifrado de columna para DNI/dirección con claves fuera del repositorio; enlaces de email construidos con `FRONTEND_URL` fija; secretos solo en variables de entorno.

Threat model y controles: plan, sección 13. No afirmes nunca que el sistema es "totalmente seguro".

---

## 8. API REST

Prefijo `/api/v1`. Recursos en plural y kebab-case; `/me` para recursos propios; cambios de estado como acciones explícitas (`POST /service-contracts/:id/complete`), nunca `PATCH { status }` libre; rutas de backoffice bajo `/admin`. Paginación por página (máx. 50) o por cursor (mensajes, notificaciones), con metadatos; filtros y orden con lista blanca. Códigos HTTP y formato de error: plan, sección 11.1. Swagger documenta autenticación por cookie y el header CSRF. Propuesta de endpoints: plan, secciones 11.2 y 11.3.

---

## 9. Reglas funcionales sensibles (recordatorio)

- Solo el cliente inicia conversaciones; **una conversación por pareja cliente-profesional**; se verifica la participación en cada lectura y escritura.
- Una solicitud puede ir a varios profesionales; solo uno es seleccionado; los demás reciben un aviso.
- Transiciones de estado validadas por máquina de estados y por actor; nunca cambios arbitrarios desde el cliente.
- Precios y límites de planes solo desde `subscription_plans` (configurable por el admin, auditado), nunca duplicados en código.
- **No procesar pagos confiando en el frontend**: el estado lo define el webhook verificado o la consulta al proveedor.
- **No implementar** sin mi aprobación expresa: cobro automático o débito recurrente, multa de $8.000, interés del 3 %, sanciones automáticas, borrado automático de chats, almacenamiento de DNI/selfies o biometría, ubicación en tiempo real persistida, descarga de datos de clientes, acceso del admin a chats fuera de un reporte.
- La falta de pago oculta el perfil y bloquea funciones profesionales, pero **no borra** perfil, reseñas ni historial.

---

## 10. Pruebas

Jest + Supertest. Unitarias (reglas de negocio, máquinas de estado, límites de plan, rotación de tokens), integración contra PostgreSQL real (constraints, transacciones, migraciones) y e2e con cookies reales (`request.agent`).

Casos de seguridad obligatorios: no autenticado; autenticado sin permisos; recurso ajeno; intento de cambiar el propio rol o datos protegidos; profesional superando límites del plan; cliente accediendo a conversación ajena; cuenta suspendida o pendiente de verificación; webhook duplicado o con firma inválida; token expirado; refresh revocado; **reutilización de refresh rotado**; logout que revoca y borra cookies con los atributos correctos; cookies emitidas con `HttpOnly`/`SameSite`/`Path`/`Secure` esperados; ningún token en el body; POST sin `Origin` válido, sin header o sin token CSRF rechazado; sesiones de usuarios distintos sin mezclarse. Lista completa: plan, secciones 9.10 y 14.

**No marques nada como terminado si sus pruebas principales no se ejecutaron. No digas que una prueba pasa si no la ejecutaste.** Mostrá el comando y el resultado.

---

## 11. Documentación

Mantené actualizado: `README.md` (cómo instalar, configurar variables, levantar Docker, migrar, sembrar, testear, iniciar y abrir Swagger), `docs/architecture.md`, `docs/data-model.md` (con ER en Mermaid), `docs/auth.md`, `docs/authorization.md`, `docs/endpoints.md` o Swagger, `docs/env.md`, `docs/integrations.md`, `docs/testing.md`, ADRs en `docs/decisions/` y la lista viva de decisiones pendientes. Otro desarrollador debe poder levantar el backend sin esta conversación.

---

## 12. Docker y entorno local

`docker-compose.yml` con PostgreSQL (volumen persistente, healthcheck, puerto solo en `127.0.0.1`) y el backend (Dockerfile multi-stage, usuario no root, healthcheck). No exponer la base en producción. En producción las migraciones corren como paso de deploy.

---

## 13. Calidad de código

TypeScript estricto, sin `any` injustificado, nombres descriptivos, responsabilidades claras, sin duplicación, sin lógica en controllers, sin secretos en código, sin entidades ni servicios gigantes, sin dependencias circulares evitables, sin código muerto, sin TODOs que reemplacen funcionalidades obligatorias, sin refactorizar módulos no relacionados sin justificarlo. No sacrifiques mantenibilidad por velocidad.

---

## 14. Método de trabajo por etapas

Trabajá **una etapa por vez**, en una rama por etapa, con commits chicos. **Al terminar cada etapa, detenete y esperá mi aprobación.** El detalle de cada fase (alcance, prerrequisitos, bloqueos, pruebas, criterio de aceptación) está en la sección 16 del plan.

1. **Análisis y validación del plan** (sin código).
2. **Diseño final de arquitectura** (sin código): ajustes al plan según el repositorio real; esperá aprobación.
3. **Bootstrap:** NestJS, configuración validada, puerto, prefijo/versionado, Helmet, CORS, errores, logger, Swagger, health, Docker, lint/format, CI.
4. **Base de datos:** DataSource, naming, migraciones iniciales, auditoría base, seeds de catálogos.
5. **Usuarios y autenticación con cookies** (sección 6 de este prompt completa).
6. **Autorización y estados de cuenta.**
7. **Perfiles y catálogo:** ubicaciones, profesiones, uploads, verificación de identidad (integrar `docs/referencia/verificacion-identidad/` según ADR 0003, con sus tests pasando en el repo), clientes, profesionales, medios, certificados, planes y prueba (sin pagos), disponibilidad, catálogo y filtros.
8. **Chat, solicitudes y contrataciones** (+ notificaciones internas y tiempo real).
9. **Suscripciones y pagos** (sin acciones financieras sensibles no aprobadas).
10. **Reputación y comunidad:** reseñas, favoritos, foro.
11. **Moderación, soporte, administración y auditoría.**
12. **Hardening y preparación para producción:** pruebas, seguridad, migraciones, variables, dependencias, logs, permisos, documentación, Docker y despliegue. No declares el proyecto listo para producción sin listar qué integraciones, credenciales, validaciones legales y pruebas reales faltan.
13. **Premium y avanzadas** (métricas, OAuth, push, WhatsApp, chatbot/agenda, identidad automática), solo con decisiones aprobadas.

Podés reordenar si hay una dependencia técnica justificada. No implementes un módulo antes que sus dependencias.

---

## 15. Cómo informar al terminar cada etapa

1. Qué implementaste (y qué quedó solo como estructura, dicho explícitamente).
2. Archivos importantes creados o modificados.
3. Decisiones técnicas tomadas y por qué.
4. Endpoints agregados.
5. Entidades y migraciones agregadas.
6. Pruebas ejecutadas (comandos).
7. Resultado real de las pruebas.
8. Qué queda pendiente.
9. Riesgos detectados.
10. Qué etapa sigue y qué decisiones mías necesitás antes.

No ocultes errores. Si necesitás una decisión mía, hacé una pregunta concreta, con opciones, tu recomendación y por qué importa.

---

## 16. Primera tarea (ahora)

Tu única tarea en este momento es:

1. Inspeccionar el repositorio (estructura, `package.json`, versiones, lo que ya exista; si está vacío, decilo).
2. Leer completos todos los documentos de `docs/` (incluidos `docs/decisions/` y el README de `docs/referencia/verificacion-identidad/`) y confirmarme cuáles pudiste leer.
3. Contrastar `docs/PLAN_BACKEND_REPARA_YA_NEXO_PRO.md` con los documentos funcionales y con el repositorio real, y entregar:
   - resumen del producto en pocas líneas;
   - confirmación o ajustes a la arquitectura, módulos y estructura de carpetas;
   - confirmación o ajustes al modelo de datos (indicando cambios respecto del ER del plan);
   - dependencias entre módulos;
   - contradicciones (las del plan que sigan vigentes + nuevas) y decisiones pendientes, marcando cuáles bloquean la etapa de autenticación;
   - riesgos;
   - roadmap confirmado o ajustado;
   - las preguntas que necesitás que responda antes de la etapa 3, priorizadas.

**No escribas código, no instales dependencias y no crees archivos de aplicación todavía.** Quiero revisar y aprobar la arquitectura antes de empezar. A partir de mi aprobación trabajaremos etapa por etapa hasta completar el backend.
