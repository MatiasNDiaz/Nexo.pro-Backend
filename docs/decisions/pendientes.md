# Decisiones pendientes y contradicciones abiertas (lista viva)

Fuente: plan §4.2 y §4.3 más el análisis de la etapa 1. Se actualiza al cerrar cada etapa.
"Bloquea" indica la primera etapa que no puede cerrarse sin la decisión.

## Contradicciones

| #           | Tema                                                                    | Propuesta                                                                 | Bloquea       |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------- |
| C-03        | ¿Los clientes pagan algo alguna vez?                                    | Suscripciones solo para profesionales                                     | Etapa 9       |
| C-04        | Cobro automático al fin de la prueba                                    | Sin cobro automático; checkout manual                                     | Etapa 9       |
| C-05        | Límites de contenido Premium                                            | Valores en `subscription_plans`; confirmar números                        | Etapa 7       |
| C-06        | Cuándo se puede reseñar                                                 | Ligada a una contratación aceptada o posterior                            | Etapa 10      |
| C-07        | Clasificación de clientes (quién califica)                              | `customer_ratings` si la dan los profesionales; no exponer sin mínimos    | Etapa 10      |
| C-08 / C-30 | Disponibilidad manual vs. automática; efecto de una contratación activa | Manual por defecto, automática opcional y apagada; sugerir "Trabajando"   | Etapas 7 y 8  |
| C-09        | Umbrales de strikes                                                     | Configurables; en la v1 decide el admin                                   | Etapa 11      |
| C-10        | Borrado de chats al mes vs. reportes                                    | No borrar con reporte abierto; job apagado                                | Etapa 8 (job) |
| C-11        | Historial de estados de contratación                                    | Solo transiciones                                                         | Etapa 8       |
| C-12        | Profesional impago con trabajos en curso                                | Cliente conserva lectura del chat                                         | Etapa 9       |
| C-13        | Cuándo ve el profesional el perfil del cliente                          | Con conversación iniciada por el cliente; dirección solo con contratación | Etapa 8       |
| C-14        | Tiempo real (WebSocket, dependencia nueva)                              | Gateway Socket.IO en el mismo proceso                                     | Etapa 8       |
| C-16        | Eliminación de cuentas                                                  | Soft delete + anonimización                                               | Etapa 6       |
| C-18        | Descarga de datos del cliente por el profesional                        | No implementar hasta revisión legal                                       | Legal         |
| C-19        | Email/teléfono públicos vs. scraping                                    | Rate limit; solo en el detalle                                            | Informativo   |
| C-23        | Criterio para perder la prueba                                          | Configurable y apagado hasta decidir                                      | Etapa 7       |
| C-24        | Fórmula del upgrade                                                     | Precio nuevo − pagado, dentro de 10 días, con pago aprobado               | Etapa 9       |
| C-25        | Cuenta comprometida: ¿cuenta nueva?                                     | Recuperar la misma cuenta                                                 | Etapa 6       |
| C-27        | Admin no suspende suscripciones vs. `SUSPENDED_BY_ADMIN`                | Quitar ese estado                                                         | Etapa 9       |
| C-28        | Foro vinculable a una contratación                                      | FK opcional en `service_requests`                                         | Etapa 8       |
| C-29        | Sanción solo al perfil profesional                                      | Tipo de sanción `PROFILE_HIDDEN`                                          | Etapa 11      |
| C-32        | Alcance del acceso del admin a chats                                    | Solo con reporte, auditado (legal)                                        | Etapa 11      |

Resueltas: C-01 (ADR 0002), C-02 (ADR 0003, provisoria), C-15 (puerto 3001), C-26 (mail de consola), C-31 (ADR 0005), C-33 (ADR 0006), C-35 (ADR 0007). C-17, C-20, C-21 y C-22 son técnicas y se aplican como propone el plan. C-34 (admin único con MFA) se trata como riesgo en la etapa 5.

## Decisiones pendientes

| #           | Tema                                                  | Solución provisoria                            | Bloquea                |
| ----------- | ----------------------------------------------------- | ---------------------------------------------- | ---------------------- |
| P-04        | Máquina de estados de contrataciones                  | Propuesta FI §11.3 en tabla de transiciones    | Etapa 8                |
| P-05        | Retención de chats                                    | No borrar                                      | Legal                  |
| P-06 / P-07 | Débito automático, multa e interés                    | No implementar                                 | Etapa 9 / legal        |
| P-08        | Política de sanciones                                 | Solo manual por el admin                       | Etapa 11               |
| P-09 / P-10 | Clasificación de clientes y ranking                   | No exponer / orden provisional                 | Etapa 7 / 10           |
| P-11        | Ubicación en tiempo real, "cerca de mí"               | Solo zona declarada                            | Etapa 7                |
| P-12        | Proceso de cambio de rol                              | Solo por el admin, auditado                    | Etapa 6                |
| P-13        | Marca definitiva                                      | Prefijo `nx_` (ADR 0008)                       | Producción             |
| P-14        | Límites de archivos                                   | 5 MB imágenes, 30 MB / 15 s videos (a validar) | Etapa 7                |
| P-15        | Canales externos de notificación                      | Solo internas + email de auth                  | Etapa 13               |
| —           | Fuente oficial de localidades y barrios de Córdoba    | Pocos datos de ejemplo en desarrollo           | Etapa 4 (datos reales) |
| —           | Proveedor de email transaccional y dominio (SPF/DKIM) | Adaptador de consola                           | Producción (ADR 0002)  |
