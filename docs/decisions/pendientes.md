# Decisiones pendientes y contradicciones abiertas (lista viva)

Fuente: plan §4.2 y §4.3 más el análisis de la etapa 1. Se actualiza al cerrar cada etapa.
"Bloquea" indica la primera etapa que no puede cerrarse sin la decisión.

## Contradicciones

| #           | Tema                                                                    | Propuesta                                                                 | Bloquea       |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------- |
| C-03        | ¿Los clientes pagan algo alguna vez?                                    | Suscripciones solo para profesionales                                     | Etapa 9       |
| C-04        | Cobro automático al fin de la prueba                                    | Sin cobro automático; checkout manual                                     | Etapa 9       |
| C-06        | Cuándo se puede reseñar                                                 | Ligada a una contratación aceptada o posterior                            | Etapa 10      |
| C-07        | Clasificación de clientes (quién califica)                              | `customer_ratings` si la dan los profesionales; no exponer sin mínimos    | Etapa 10      |
| C-08 / C-30 | Disponibilidad manual vs. automática; efecto de una contratación activa | Manual por defecto, automática opcional y apagada; sugerir "Trabajando"   | Etapas 7 y 8  |
| C-09        | Umbrales de strikes                                                     | Configurables; en la v1 decide el admin                                   | Etapa 11      |
| C-10        | Borrado de chats al mes vs. reportes                                    | No borrar con reporte abierto; job apagado                                | Etapa 8 (job) |
| C-11        | Historial de estados de contratación                                    | Solo transiciones                                                         | Etapa 8       |
| C-12        | Profesional impago con trabajos en curso                                | Cliente conserva lectura del chat                                         | Etapa 9       |
| C-13        | Cuándo ve el profesional el perfil del cliente                          | Con conversación iniciada por el cliente; dirección solo con contratación | Etapa 8       |
| C-14        | Tiempo real (WebSocket, dependencia nueva)                              | Gateway Socket.IO en el mismo proceso                                     | Etapa 8       |
| C-18        | Descarga de datos del cliente por el profesional                        | No implementar hasta revisión legal                                       | Legal         |
| C-19        | Email/teléfono públicos vs. scraping                                    | Rate limit; solo en el detalle                                            | Informativo   |
| C-24        | Fórmula del upgrade                                                     | Precio nuevo − pagado, dentro de 10 días, con pago aprobado               | Etapa 9       |
| C-27        | Admin no suspende suscripciones vs. `SUSPENDED_BY_ADMIN`                | Quitar ese estado                                                         | Etapa 9       |
| C-28        | Foro vinculable a una contratación                                      | FK opcional en `service_requests`                                         | Etapa 8       |
| C-29        | Sanción solo al perfil profesional                                      | Tipo de sanción `PROFILE_HIDDEN`                                          | Etapa 11      |
| C-32        | Alcance del acceso del admin a chats                                    | Solo con reporte, auditado (legal)                                        | Etapa 11      |

Resueltas: P-14 (pesos de archivos, ADR 0018), C-01 (ADR 0002), C-02 (ADR 0003, provisoria), C-05 (ADR 0009), C-15 (puerto 3001), C-16 (ADR 0013, **pendiente de revisión legal**), C-23 (ADR 0017), C-25 (ADR 0014), C-26 (mail de consola), C-31 (ADR 0005), C-33 (ADR 0006 y 0010), C-35 (ADR 0007), C-36 (ADR 0016). C-17, C-20, C-21 y C-22 son técnicas y se aplican como propone el plan.

C-34 (admin único con MFA): mitigado con 10 códigos de recuperación de un solo uso. Falta un procedimiento para reenrolar el TOTP si se pierden dispositivo y códigos (hoy requiere intervención directa en la base).

## Decisiones pendientes

| #           | Tema                                                     | Solución provisoria                                                                                     | Bloquea                  |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| P-04        | Máquina de estados de contrataciones                     | Propuesta FI §11.3 en tabla de transiciones                                                             | Etapa 8                  |
| P-05        | Retención de chats                                       | No borrar                                                                                               | Legal                    |
| P-06 / P-07 | Débito automático, multa e interés                       | No implementar                                                                                          | Etapa 9 / legal          |
| P-08        | Política de sanciones                                    | Solo manual por el admin                                                                                | Etapa 11                 |
| P-09 / P-10 | Clasificación de clientes y ranking                      | No exponer / orden provisional                                                                          | Etapa 7 / 10             |
| P-11        | Ubicación en tiempo real, "cerca de mí"                  | Solo zona declarada                                                                                     | Etapa 7                  |
| P-13        | Marca definitiva                                         | Prefijo `nx_` (ADR 0008)                                                                                | Producción               |
| P-15        | Canales externos de notificación                         | Solo internas + email de auth                                                                           | Etapa 13                 |
| —           | Proveedor de email transaccional y dominio (SPF/DKIM)    | Adaptador de consola. **Sin él la API no arranca en producción** (la validación lo exige)               | Producción (ADR 0002)    |
| —           | Login con Google (ADR 0015)                              | Agendado como etapa 7B: credenciales OAuth de Google y URLs de callback por ambiente                    | Etapa 7B                 |
| —           | Efecto del cambio de rol sobre la suscripción (ADR 0012) | Sin efecto hasta que existan las suscripciones                                                          | Etapa 9                  |
| —           | Revisión legal de la baja de cuenta (ADR 0013 y 0016)    | 30 días de gracia con los datos guardados y después anonimización; qué se conserva y por cuánto tiempo  | Legal                    |
| —           | Duración de las suspensiones                             | Indefinidas hasta que el admin las levanta; duraciones y sanciones en la etapa 11 (C-09)                | Etapa 11                 |
| —           | CAPTCHA tras varios fallos de login/registro             | Sin CAPTCHA; rate limit por IP + bloqueo por cuenta                                                     | Producción               |
| —           | Rechazo de contraseñas filtradas (HIBP)                  | No implementado (llamada externa, ADR 0011)                                                             | Producción               |
| —           | Cambio de email (confirmación al nuevo, aviso al viejo)  | No implementado                                                                                         | Etapa 7.2                |
| —           | Credenciales de Cloudinary (cuenta del fundador)         | Adaptador local en disco. **Sin Cloudinary la API no arranca en producción** (la validación lo exige)   | Producción               |
| —           | Cambiar la foto después de verificar la identidad        | Se permite y no reabre la verificación. ¿Debería volver a revisión o quedar bloqueada?                  | Etapa 7.2                |
| —           | Proveedor real de verificación de identidad (ADR 0003)   | Manual: el admin decide (videollamada). Elegir proveedor y revisión legal del consentimiento biométrico | Legal / etapa 13         |
| —           | Reintento de borrados fallidos en Cloudinary             | Se registra en el log; el archivo queda marcado DELETED en la base. Job de reintento                    | Etapa 12                 |
| —           | Moderación del contenido de las fotos                    | Sin moderación automática; el admin ve la foto al verificar la identidad. Reportes en la etapa 11       | Etapa 11                 |
| —           | Aviso al admin de verificaciones pendientes              | El admin consulta la cola (`GET /admin/identity-verifications`)                                         | Etapa 8 (notificaciones) |
| —           | Límite de sesiones activas por usuario                   | Sin límite                                                                                              | Etapa 12                 |
| —           | Limpieza de sesiones y tokens vencidos (job)             | Sin job: las filas vencidas no sirven pero quedan                                                       | Etapa 12                 |
| —           | Avisos al admin por cada registro (CF §6.5)              | Solo auditoría `USER_REGISTERED`                                                                        | Etapa 8 (notificaciones) |

## Valores provisorios cargados en la base (etapa 4)

Están en `src/database/seeds/catalogs.data.ts`. Se cambian desde la base (el admin, a partir de la
etapa 7): el seed nunca pisa lo que ya existe.

| Dato                                 | Valor cargado                                                                              | Qué falta                                                  | Bloquea    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------- |
| Localidades de Córdoba               | 1 provincia y 1 localidad (Córdoba capital). Los barrios los crean los usuarios (ADR 0010) | ¿Qué otras localidades se habilitan?                       | Producción |
| Coordenadas de localidades y barrios | Ninguna (`null`)                                                                           | Fuente oficial; las necesita "cerca de mí" (P-11)          | Etapa 7    |
| Oficios                              | 10 de ejemplo                                                                              | Catálogo definitivo del fundador                           | Producción |
| Precios de los planes                | $10.000 / $15.000 / $20.000 ARS                                                            | Confirmar vigencia (FI §6.3)                               | Producción |
| Imágenes de Basic y Medium           | 5 en total                                                                                 | ¿Se valida el reparto "2 de presentación + 3 de trabajos"? | Etapa 7    |
| Métricas en Medium                   | No                                                                                         | "No confirmado" en FI §6.3                                 | Etapa 13   |
| Ranking por plan                     | `ranking_tier` 0 / 1 / 2                                                                   | Pesos del ranking (P-10)                                   | Etapa 7    |
| Etiqueta "Recomendado" de Premium    | Sin modelar                                                                                | Cómo se muestra y si es un campo del plan                  | Etapa 7    |
