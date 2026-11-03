# Roadmap (vivo)

Etapas del prompt maestro (`docs/prompts/PROMPT_CLAUDE_CODE_BACKEND.md` §14) con los cambios aprobados.
Detalle de alcance, bloqueos y criterios de aceptación: plan §16. Una rama por etapa
(`etapa-NN-nombre`); cada etapa se cierra con informe y aprobación del fundador.

| Etapa  | Contenido                                                                                                                                  | Estado                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| 1      | Análisis y validación del plan                                                                                                             | ✅ Aprobada                      |
| 2      | Diseño final de arquitectura                                                                                                               | ✅ Aprobada (junto con la 1)     |
| 3      | Bootstrap: config, pipeline HTTP, errores, logger, Swagger, health, Docker, CI                                                             | ✅ Aprobada                      |
| 4      | Base de datos: TypeORM, migraciones, auditoría, catálogos                                                                                  | ✅ Aprobada                      |
| 5      | Usuarios y autenticación con cookies                                                                                                       | ✅ Aprobada                      |
| 6      | Autorización y estados de cuenta: suspensión, baneo, cambio de rol, baja, revocación                                                       | ✅ Aprobada                      |
| 7.1    | Archivos (Cloudinary + local), foto de perfil, verificación de identidad (módulo de referencia), moderación de barrios, tareas programadas | ✅ Aprobada                      |
| 7.2    | Perfiles de cliente y profesional, medios, certificados, personalización, disponibilidad, planes y prueba de 30 días                       | ✅ Aprobada                      |
| 7.3    | Catálogo público, filtros y página pública; edición de datos personales (ADR 0021 y 0022)                                                  | ✅ Aprobada                      |
| **7B** | **Login con Google** para clientes y profesionales (ADR 0015)                                                                              | ✅ Aprobada (adaptador simulado) |
| 8      | Chat, solicitudes y contrataciones; notificaciones internas y tiempo real                                                                  | ✅ Aprobada                      |
| 9      | Suscripciones y pagos con Mercado Pago (ADR 0026)                                                                                          | ✅ Aprobada (adaptador simulado) |
| 10     | Reputación y comunidad: reseñas, favoritos, foro (ADR 0027 y 0028)                                                                         | ✅ Aprobada                      |
| 11     | Moderación, soporte, administración y auditoría (ADR 0029)                                                                                 | ✅ Aprobada                      |
| 12     | Hardening y preparación para producción (`docs/revision-seguridad.md`, `docs/operacion.md`)                                                | ✅ Aprobada                      |
| 13.1   | Panel de ingresos del admin: pagos, registros, resumen neto y CSV auditado (ADR 0030)                                                      | ✅ Aprobada                      |
| 13.2   | Email por inicio de sesión desde un dispositivo nuevo (ADR 0031)                                                                           | ✅ Aprobada                      |
| 13.3   | Notificaciones push web (`web-push`, ADR 0032)                                                                                             | En revisión                      |
| 13     | Métricas Premium (a proponer al cerrar la 13.3)                                                                                            | Pendiente                        |
| —      | WhatsApp, chatbot/agenda e identidad automática                                                                                            | Después del lanzamiento          |

Google OAuth estaba en la etapa 13 (plan §16); el fundador lo adelantó a 7B.
