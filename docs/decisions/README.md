# Decisiones aprobadas (ADR)

Cada archivo registra una decisión del fundador. Prevalecen sobre `PLAN_BACKEND_REPARA_YA_NEXO_PRO.md`.
Formato: contexto, decisión, consecuencias, fecha. Para cambiar una decisión se crea un ADR nuevo que la reemplaza.

| ADR                                                     | Decisión                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-dominio-propio-subdominios.md)              | Dominio propio: `app.<dominio>` + `api.<dominio>`, cookies `SameSite=Lax` host-only                                                   |
| [0002](0002-recuperacion-contrasena-por-admin.md)       | Recuperación de contraseña disparada por el admin; autoservicio apagado                                                               |
| [0003](0003-verificacion-identidad-manual.md)           | Verificación de identidad manual, sin imágenes de DNI ni selfies                                                                      |
| [0004](0004-versiones-stack.md)                         | NestJS 12 + TypeORM 1.x + Node 26                                                                                                     |
| [0005](0005-verificacion-email.md)                      | Verificación de email al registrarse                                                                                                  |
| [0006](0006-registro-en-dos-pasos.md)                   | Registro en dos pasos; el número de DNI no se guarda                                                                                  |
| [0007](0007-acceso-cuentas-suspendidas.md)              | Cuentas suspendidas/baneadas: solo motivo, apelación y logout                                                                         |
| [0008](0008-duracion-tokens-y-cookies.md)               | Duración de tokens y prefijo de cookies `nx_`                                                                                         |
| [0009](0009-limites-plan-premium.md)                    | Premium: 5 imágenes y 2 videos (configurable)                                                                                         |
| [0010](0010-barrios-creados-por-usuarios.md)            | Barrios creados por los usuarios; zonas de trabajo del profesional (1 a 20)                                                           |
| [0011](0011-politica-de-contrasenas.md)                 | Contraseñas: mínimo 8 (admin 12), argon2id                                                                                            |
| [0012](0012-cambio-de-rol.md)                           | Cambio de rol solo por el admin; el perfil anterior queda inactivo                                                                    |
| [0013](0013-baja-de-cuenta.md)                          | Baja con anonimización inmediata (sujeta a revisión legal)                                                                            |
| [0014](0014-cuenta-comprometida.md)                     | Cuenta comprometida: se recupera la misma cuenta                                                                                      |
| [0015](0015-login-con-google.md)                        | Login con Google para clientes y profesionales (etapa 7B)                                                                             |
| [0016](0016-periodo-de-gracia-en-la-baja.md)            | Baja con 30 días de gracia (restaurable) antes de anonimizar                                                                          |
| [0017](0017-prueba-gratuita.md)                         | Prueba de 30 días desde el registro, con contador y recordatorios                                                                     |
| [0018](0018-archivos-en-cloudinary.md)                  | Archivos en Cloudinary; pesos máximos por plan                                                                                        |
| [0019](0019-cambio-de-foto-con-identidad-aprobada.md)   | Cambio de foto con identidad aprobada: vuelve a revisión, se ve la anterior                                                           |
| [0020](0020-certificados-sin-aprobacion-previa.md)      | Certificados publicados al subirlos, ocultables por el admin, "cargados por el profesional"                                           |
| [0021](0021-edicion-de-datos-personales.md)             | Edición de datos: teléfono libre; nombre en revisión con identidad aprobada; el admin edita con motivo                                |
| [0022](0022-orden-del-catalogo.md)                      | Orden provisional del catálogo: plan, disponibles, perfiles más completos                                                             |
| [0023](0023-cuentas-con-google.md)                      | Google con openid-client; contraseña opcional; sesión reciente para crear contraseña o darse de baja; desvincular solo con contraseña |
| [0024](0024-chat-y-mensajes.md)                         | Chat: Socket.IO en la misma API, un chat por pareja, editar 15 min, original solo para el admin ante un reporte                       |
| [0025](0025-solicitudes-y-contrataciones.md)            | Solicitudes y contrataciones: negociación por profesional y contratación con transiciones                                             |
| [0026](0026-pagos-con-mercado-pago.md)                  | Pagos con Mercado Pago: checkout manual mensual, control de coincidencia y reversión por reembolso o contracargo                      |
| [0027](0027-chat-sin-plan-con-contratacion-en-curso.md) | Sin plan vigente, el chat sigue solo con una contratación en curso, hasta que se cierre (C-12)                                        |
| [0028](0028-resenas-favoritos-y-foro.md)                | Reseñas (solo terminadas, 30 días para reseñar y editar), favoritos con avisos, foro y opiniones de la plataforma                     |
| [0029](0029-moderacion-sanciones-y-soporte.md)          | Moderación manual: reportes, strikes, sanciones y apelaciones; chat solo desde un reporte de mensaje; soporte y novedades             |
| [0030](0030-panel-de-ingresos.md)                       | Panel de ingresos del admin: 4 tipos de pago, neto con criterio de caja, CSV de pagos con email y de registros sin email, auditado    |
| [0031](0031-aviso-de-dispositivo-nuevo.md)              | Email por dispositivo nuevo: cookie propia, ciudad de Cloudflare sin guardarla, cierre de esa sesión con un `POST` desde el enlace    |

Las decisiones todavía abiertas están en [pendientes.md](pendientes.md).
