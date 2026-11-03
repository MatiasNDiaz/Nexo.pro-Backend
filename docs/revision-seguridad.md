# Revisión de seguridad (etapa 12)

Revisión completa de la API contra [`seguridad.md`](seguridad.md), sección por sección, hecha el
03/11/2026 sobre la rama `etapa-12-hardening`. Cada punto dice si **cumple**, si es **parcial**, si
**no aplica** a este repositorio (frontend) o si está **pendiente**, con la evidencia (código o
test) y lo que se corrigió en esta etapa.

> Esto no significa que el sistema sea "totalmente seguro": significa que los controles de la guía
> están implementados y probados donde dice. Lo que falta para producción está al final.

## Inventario de endpoints

[`docs/endpoints.md`](endpoints.md) lista **las 187 rutas** con su rol, estados de cuenta, CSRF,
Origin y límite de pedidos, generado desde la app. `test/endpoint-inventory.e2e-spec.ts` falla si:

- una ruta `/admin` no exige ADMIN activo;
- una ruta que modifica datos con sesión no exige CSRF y Origin (solo los dos webhooks, que se
  autentican por firma, no lo hacen);
- una ruta con sesión no declara rol, salvo la lista revisada (cuenta propia, sesión y
  notificaciones);
- una ruta admite cuentas suspendidas o baneadas fuera de la lista de ADR 0007;
- una ruta pública que modifica datos no tiene un límite propio (salvo `POST /auth/logout`);
- el documento quedó desactualizado.

`test/route-security.e2e-spec.ts` (desde la etapa 6) sigue probando que **toda** ruta no pública
responde 401 sin sesión y que **toda** ruta `/admin` responde 403 a un cliente.

## Por sección

| §    | Tema                                 | Estado                  | Evidencia y notas                                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2    | Secretos y entorno                   | Cumple                  | `env.validation.ts` valida al arrancar y nunca muestra valores; reglas de producción (https, cookies Secure, sin adaptadores simulados, **TRUST_PROXY ≥ 1: nuevo**). `.env*` ignorados salvo plantillas; **escaneo de secretos en la CI (nuevo, gitleaks)**                         |
| 3.1  | Mínimo privilegio en la base         | Cumple (en Docker)      | Rol de runtime `nexo_app` solo DML; auditoría sin UPDATE/DELETE (probado en la restauración del backup). En Railway hay que crear los roles: `docs/operacion.md`                                                                                                                    |
| 3.2  | Conexión segura                      | Cumple                  | Red privada de Railway; `DB_SSL` disponible. **Nuevo:** tiempo máximo por consulta (`DB_STATEMENT_TIMEOUT_MS`, 15 s) y de conexión                                                                                                                                                  |
| 3.3  | Constraints                          | Cumple                  | Checks, FKs, únicos parciales en todas las tablas; `test/integration/migrations.int-spec.ts` compara entidades y base                                                                                                                                                               |
| 3.4  | Cifrado por columna                  | Cumple                  | Secreto TOTP con AES-256-GCM; no se guardan DNI, selfies ni biometría (prohibido)                                                                                                                                                                                                   |
| 3.5  | RLS                                  | No aplica               | Opcional en la guía; la propiedad se valida en cada servicio y con tests de IDOR                                                                                                                                                                                                    |
| 3.6  | Backups                              | **Cumple (nuevo)**      | Backups de Railway + backup propio cifrado diario a R2 (`ops/backup`). **Restauración probada** en una base nueva: mismas migraciones, datos, triggers y permisos                                                                                                                   |
| 4.1  | `synchronize: false`                 | Cumple                  | `data-source.options.ts`; solo migraciones escritas a mano                                                                                                                                                                                                                          |
| 4.3  | Inyección SQL                        | Cumple                  | Todo con parámetros. Revisé cada interpolación en SQL: solo constantes o literales tipados (nombres de tabla del foro), nunca texto del usuario; `ILIKE` con escape de comodines                                                                                                    |
| 4.4  | Soft delete y auditoría              | Cumple                  | `deleted_at` en contenido; auditoría append-only con trigger                                                                                                                                                                                                                        |
| 5    | `main.ts` seguro                     | Cumple                  | helmet, CORS con lista exacta y credenciales, límite de body, `trust proxy`, ValidationPipe con `whitelist` + `forbidNonWhitelisted`, apagado ordenado. **Nuevo:** tiempos máximos de HTTP (60 s por pedido, 20 s de headers)                                                       |
| 5.1  | Guards globales, denegar por defecto | Cumple                  | Throttler → Origin → JWT → CSRF → estado de cuenta → rol; test de las 187 rutas                                                                                                                                                                                                     |
| 5.2  | Errores sin filtrar                  | Cumple                  | `AllExceptionsFilter`: 5xx genérico, conflictos de PostgreSQL sin nombres de tablas                                                                                                                                                                                                 |
| 6    | DTOs de entrada y salida             | Cumple                  | DTO validado en cada ruta; respuestas armadas a mano; `password_hash` no se selecciona por defecto                                                                                                                                                                                  |
| 7    | Contraseñas                          | Cumple                  | argon2id (parámetros OWASP); 8/12 caracteres sin reglas de composición (ADR 0011). **Nuevo:** rechazo de contraseñas filtradas (Have I Been Pwned), apagado hasta activarlo                                                                                                         |
| 8.1  | Login                                | Cumple                  | Mensaje genérico, mismo tiempo exista o no el email, bloqueo progresivo por cuenta. **Nuevo:** CAPTCHA tras 3 fallos por IP (Turnstile, apagado hasta las claves)                                                                                                                   |
| 8.2  | Avisos de seguridad                  | Parcial                 | Email al cambiar la contraseña y al intentar registrarse con un email existente. **Sin aviso de inicio de sesión desde un dispositivo nuevo** (decisión pendiente)                                                                                                                  |
| 9    | Tokens y cookies                     | Cumple                  | Access token de 10 min (5 admin); cookies httpOnly, Secure, SameSite, prefijo `__Host-`, path restringido                                                                                                                                                                           |
| 10   | Refresh con rotación                 | Cumple                  | Token opaco hasheado, rotación atómica, reutilización = revoca la familia y se audita. **Nuevo:** máximo 10 dispositivos por usuario                                                                                                                                                |
| 11   | Logout y revocación                  | Cumple                  | Logout revoca en el servidor; cerrar uno o todos los dispositivos; suspensión, baneo y cambio de rol revocan                                                                                                                                                                        |
| 12   | CSRF                                 | Cumple                  | SameSite + Origin + `X-Requested-With` + token firmado ligado al dispositivo; ver inventario                                                                                                                                                                                        |
| 13   | Roles y anti-IDOR                    | Cumple                  | Rol desde la base; cada servicio filtra por dueño (404 sin confirmar existencia). Revisé en particular: sesiones (`closeOwnFamily`), adjuntos del chat (participación), fotos de reportes y soporte (autor o admin), consultas de soporte, reseñas, foro, favoritos, contrataciones |
| 14   | Tokens de un solo uso                | Cumple                  | Hasheados, vencen, un uso, invalidan los anteriores. Cambio de email: **no implementado** (pendiente)                                                                                                                                                                               |
| 15   | MFA                                  | Cumple                  | TOTP obligatorio para el admin con 10 códigos de recuperación. **Nuevo:** `admin:reset-mfa` para recuperar el acceso (probado: reemplaza el secreto, cierra las sesiones y audita)                                                                                                  |
| 16   | Rate limiting y fuerza bruta         | Cumple                  | Límite global por IP y límites propios en auth, contacto, pagos y creación de contenido; bloqueo por cuenta. CAPTCHA listo para activar                                                                                                                                             |
| 17   | Subida de archivos                   | Cumple                  | Tipo real por el proveedor, pesos por plan, claves aleatorias, privados con enlace firmado de 5 min. **Corregido:** al ocultar contenido ahora pasa a privado también en Cloudinary; los borrados fallidos se reintentan                                                            |
| 18   | Panel del admin                      | Cumple                  | MFA, sesión corta, motivo y auditoría en cada acción, sin acciones sobre otro admin. La confirmación visual es del frontend                                                                                                                                                         |
| 19   | Frontend                             | No aplica               | Repositorio del backend. La API no devuelve tokens en el cuerpo; textos de usuario se devuelven como texto (el frontend no debe renderizarlos como HTML)                                                                                                                            |
| 20.1 | Logs sin datos sensibles             | Cumple                  | pino con redacción de cookies, autorización, contraseñas y tokens                                                                                                                                                                                                                   |
| 20.2 | Auditoría                            | **Cumple (corregido)**  | **Faltaba auditar los inicios de sesión:** ahora `LOGIN_SUCCEEDED` / `LOGIN_FAILED` con la IP seudonimizada (HMAC) y sin el email. Los cierres de sesión quedan en `auth_sessions` con su motivo                                                                                    |
| 20.3 | Monitoreo y alertas                  | **Cumple (nuevo)**      | Sentry sin datos personales (apagado sin DSN); alertas cada 15 min por picos de logins fallidos, cuentas bloqueadas, tokens reutilizados, 401/403 y 500; monitor de uptime externo (pasos en `docs/operacion.md`)                                                                   |
| 21   | Dependencias                         | **Cumple (nuevo)**      | `npm audit` en la CI (falla con altas o críticas), lockfile y `npm ci`; **nuevos** Dependabot, CodeQL y gitleaks. Protección de `main`, secret scanning y 2FA de las cuentas: configuración tuya (ver pendientes)                                                                   |
| 22   | Deploy                               | Documentado             | `docs/operacion.md`: dominio propio con subdominios, red privada, migraciones como paso del deploy, Swagger apagado, staging separado                                                                                                                                               |
| 23   | Tests de seguridad                   | Cumple                  | 401 en todas las rutas privadas, 403 en todas las de admin, invariantes del inventario, IDOR por módulo, CSRF, reutilización de tokens, webhooks con firma inválida                                                                                                                 |
| 24   | Privacidad                           | Parcial                 | Baja con anonimización (ADR 0016) y sin datos sensibles. **Pendiente legal:** política de privacidad y términos                                                                                                                                                                     |
| 25   | Respuesta ante incidentes            | **Documentado (nuevo)** | Plan en `docs/operacion.md`                                                                                                                                                                                                                                                         |

## Hallazgos de esta revisión y qué se hizo

1. **Los inicios de sesión no se auditaban** (solo los del admin y los bloqueos). Corregido.
2. **Producción no exigía confiar en el proxy de Railway.** Sin eso, todos los pedidos llegan con la
   IP del proxy y el límite por IP (y el CAPTCHA por IP) dejaría de servir. Ahora la validación del
   entorno lo exige.
3. **Contenido oculto seguía público en Cloudinary** (solo dejaba de aparecer en la API), y el
   borrado de un archivo oculto apuntaba al tipo equivocado y no lo borraba. Corregido: ocultar y
   restaurar cambian el acceso en Cloudinary y el borrado prueba los dos tipos.
4. **Un mínimo de contraseña escrito a mano** (8) en vez de la constante. Corregido.
5. **Sin límites de tiempo** para consultas ni pedidos HTTP. Agregados.

No surgieron tareas que necesiten cambios en la base ni dependencias nuevas más allá de las
aprobadas.

## Riesgos conocidos

- **`npm audit`: 5 avisos de severidad moderada** en `glob` y `minimatch`, que llegan con
  `@sentry/nestjs` 11 a través de sus complementos de compilación (no los usa la API en ejecución).
  La versión 10 no admite Nest 12. La CI falla solo con severidad alta; Dependabot va a proponer la
  actualización cuando Sentry la publique.
- **Una sola instancia de la API:** el límite de pedidos, el conteo de fallos para el CAPTCHA, los
  contadores de alertas y el tiempo real (Socket.IO) viven en memoria. Con varias instancias hace
  falta Redis (decisión: no por ahora).
- **Textos de usuarios** (foro, reseñas, chat) se guardan tal cual: el frontend tiene que mostrarlos
  como texto, nunca como HTML.

## Lo que falta para producción

Ver [`decisions/pendientes.md`](decisions/pendientes.md): credenciales (Mercado Pago, Google,
Cloudinary, proveedor de email, Sentry, R2, Cloudflare Turnstile, monitor de uptime), dominio
propio, revisión legal (términos, privacidad, acceso a chats, baja de cuenta), facturación AFIP,
protección de la rama `main` y 2FA en todas las cuentas.
