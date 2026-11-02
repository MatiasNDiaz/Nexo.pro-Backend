# Decisiones aprobadas (ADR)

Cada archivo registra una decisión del fundador. Prevalecen sobre `PLAN_BACKEND_REPARA_YA_NEXO_PRO.md`.
Formato: contexto, decisión, consecuencias, fecha. Para cambiar una decisión se crea un ADR nuevo que la reemplaza.

| ADR                                               | Decisión                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [0001](0001-dominio-propio-subdominios.md)        | Dominio propio: `app.<dominio>` + `api.<dominio>`, cookies `SameSite=Lax` host-only |
| [0002](0002-recuperacion-contrasena-por-admin.md) | Recuperación de contraseña disparada por el admin; autoservicio apagado             |
| [0003](0003-verificacion-identidad-manual.md)     | Verificación de identidad manual, sin imágenes de DNI ni selfies                    |
| [0004](0004-versiones-stack.md)                   | NestJS 12 + TypeORM 1.x + Node 26                                                   |
| [0005](0005-verificacion-email.md)                | Verificación de email al registrarse                                                |
| [0006](0006-registro-en-dos-pasos.md)             | Registro en dos pasos; el número de DNI no se guarda                                |
| [0007](0007-acceso-cuentas-suspendidas.md)        | Cuentas suspendidas/baneadas: solo motivo, apelación y logout                       |
| [0008](0008-duracion-tokens-y-cookies.md)         | Duración de tokens y prefijo de cookies `nx_`                                       |
| [0009](0009-limites-plan-premium.md)              | Premium: 5 imágenes y 2 videos (configurable)                                       |

Las decisiones todavía abiertas están en [pendientes.md](pendientes.md).
