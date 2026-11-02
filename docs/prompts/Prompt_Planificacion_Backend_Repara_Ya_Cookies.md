# PROMPT MAESTRO — PLANIFICACIÓN DEL BACKEND DE REPARA YA / NEXO PRO
## Arquitectura, modelo de datos, autenticación con cookies seguras y roadmap de implementación

> **Propósito:** usar este documento en una conversación de Claude para que analice el contexto completo del producto y produzca una planificación técnica profesional del backend.  
> **Importante:** esta fase es de análisis y planificación. **No debe generar ni modificar código todavía.** El plan resultante se llevará luego a Claude Code dentro de Visual Studio Code para implementar por etapas.

---

# 0. Instrucción principal

Actuá como **Senior Backend Engineer, Software Architect y especialista en seguridad de aplicaciones web**, con experiencia real en NestJS, TypeScript, PostgreSQL, TypeORM, APIs REST, autenticación basada en sesiones/JWT mediante cookies, seguridad web y sistemas marketplace.

Estoy construyendo **Repara Ya / Nexo Pro**, un marketplace que conecta clientes con profesionales de distintos oficios. Necesito que estudies toda la documentación adjunta y prepares una planificación técnica exhaustiva, clara, viable para una persona que está aprendiendo backend y que pueda ser ejecutada posteriormente por Claude Code dentro de VS Code.

Quiero una arquitectura de calidad profesional, pero no sobreingenierizada. Debe ser mantenible, segura, comprensible, modular y preparada para que la consuman un frontend Next.js y, potencialmente, una app móvil en el futuro.

## Tu tarea en esta conversación

1. Leer íntegramente los documentos adjuntos y/o los documentos del repositorio que te indique.
2. Extraer requisitos funcionales, reglas de negocio, decisiones confirmadas, decisiones pendientes, contradicciones y riesgos.
3. Diseñar la arquitectura backend y el modelo de datos propuesto.
4. Diseñar en detalle la autenticación, sesiones, cookies, autorización y controles de seguridad.
5. Preparar una hoja de ruta de implementación por fases, dependencias y criterios de aceptación.
6. Entregar una planificación final en Markdown que pueda pasar a Claude Code.

**No implementes código, no crees archivos de aplicación, no ejecutes comandos de instalación y no des por aprobadas decisiones sensibles.** Si algún documento no está disponible o no se puede leer, indicalo explícitamente y pedime el archivo faltante; no finjas haberlo leído.

---

# 1. Documentación fuente obligatoria

Tomá como fuentes primarias los documentos adjuntos:

- `Nexo_Pro_Repara_Ya_Flujo_Integral_Claude_Code.md` — especificación funcional consolidada, flujos y reglas de negocio.
- `Repara_Ya_Nexo_Pro_Contexto_Claude_Code.md` — contexto funcional inicial y alcance de la plataforma.
- `guia-seguridad-nestjs-typeorm-postgresql.md` — guía de seguridad full-stack, base de datos, NestJS, autenticación, cookies, sesiones y despliegue.
- `Texto pegado.txt` — prompt técnico de backend que ya se había preparado; usalo como antecedente, revisalo críticamente y mejoralo, no lo copies de manera ciega.

Los nombres o ubicaciones dentro del repositorio pueden diferir. Si tenés acceso al repositorio, buscá documentos equivalentes antes de asumir que faltan. Si no tenés acceso, trabajá con los adjuntos y aclaralo.

## Precedencia y fidelidad a las fuentes

- La documentación funcional representa la intención del fundador.
- El documento de seguridad es una guía de referencia; evaluá sus propuestas y adaptalas a una implementación segura y compatible, sin tomar cada ejemplo como una verdad incuestionable.
- El prompt técnico previo es un borrador, no una especificación superior a los documentos funcionales.
- No borres ni reduzcas funcionalidades por conveniencia.
- No inventes políticas comerciales, precios, permisos, condiciones legales, consentimiento ni reglas de negocio.
- Separá claramente lo que está **confirmado**, **pendiente**, **contradictorio**, **riesgoso** y lo que es una **recomendación técnica**.
- Si hay conflictos, describí la tensión, qué partes afecta, opciones posibles, recomendación y si requiere decisión del fundador.
- No resuelvas silenciosamente cuestiones sensibles de identidad, privacidad, pagos, retención de datos, acceso administrativo, ubicación o cumplimiento legal.

---

# 2. Visión funcional del producto

Repara Ya / Nexo Pro es una plataforma marketplace inicialmente orientada a Córdoba Capital, Argentina, que conecta personas que necesitan resolver tareas o contratar servicios con profesionales de oficios.

El modelo comercial principal es la suscripción mensual de profesionales. La plataforma no cobra comisión por trabajo: cliente y profesional acuerdan directamente el precio y el profesional conserva el 100 % del importe acordado. Los planes profesionales son Basic, Medium y Premium, con límites y funciones distintos.

La marca definitiva entre “Repara Ya” y “Nexo Pro” todavía puede requerir confirmación.

## Roles

- **Visitante:** explora el catálogo y los perfiles públicos, y lee el foro; no interactúa en acciones que requieren cuenta.
- **Cliente:** usuario registrado y verificado que busca, consulta, solicita y contrata servicios, conversa, publica en el foro, guarda favoritos, gestiona reseñas y reportes.
- **Profesional:** usuario registrado y verificado que publica perfil y contenido, recibe solicitudes, conversa, gestiona servicios y suscripción, y participa en el foro. No inicia chats con clientes en la primera versión; el cliente inicia.
- **Administrador/fundador:** gestiona usuarios, planes, pagos, verificaciones, contenido, moderación, reportes, sanciones, soporte y auditoría.

Un usuario no puede operar simultáneamente como cliente y profesional. Puede cambiar de rol más adelante, pero el proceso, el efecto en la suscripción y la conservación del historial requieren definición.

## Funcionalidades que deben quedar contempladas en la arquitectura

No es necesario implementarlas todas en la primera fase, pero el plan debe preservar su soporte y ordenarlas por dependencias:

- Landing y catálogo público de profesionales.
- Perfiles públicos y dashboard de cliente/profesional.
- Búsqueda y filtros por oficio, disponibilidad, reputación, trabajos realizados, verificación y zona/distancia cuando exista consentimiento.
- Profesiones, cobertura territorial y disponibilidad/horarios.
- Registro, login, logout, sesiones, verificación de email e identidad, recuperación y restablecimiento de contraseña.
- Perfil profesional con fotos, videos, certificados, personalización y límites por plan.
- Solicitudes de servicio, presupuestos/propuestas, contratación y estados/historial.
- Chat interno con mensajes, adjuntos y reportes; una conversación por pareja cliente-profesional según el documento funcional, sujeto a confirmar excepciones.
- Suscripciones, período de prueba profesional, planes y límites configurables.
- Mercado Pago como integración prevista, con verificación de eventos/webhooks y trazabilidad.
- Reseñas, respuestas, reputación y favoritos.
- Foro público de lectura con interacciones de usuarios registrados.
- Notificaciones y preferencias; potenciales push/email/WhatsApp según consentimiento y proveedores.
- Chatbot/agenda Premium, como capacidad futura, sin asumir integración real ahora.
- Reportes, strikes, sanciones, apelaciones y moderación.
- Soporte, novedades, contacto, métricas y panel administrativo.
- Auditoría de acciones sensibles.
- Carga de archivos y almacenamiento externo (Cloudinary o S3-compatible).
- Verificación de identidad, pendiente de proveedor, consentimiento, requisitos legales, retención y seguridad.
- Posible aplicación móvil futura.

## Reglas funcionales sensibles a tener presentes

- La autorización siempre se valida en el backend; esconder controles en el frontend no protege recursos.
- La dirección exacta del cliente no se expone públicamente. El acceso a datos privados debe depender del contexto autorizado y de las reglas aprobadas.
- El cliente y profesional deben estar registrados/verificados para operar; los detalles concretos del proceso de identidad están pendientes.
- La administración de chats por el fundador se limita a reportes/revisiones según lo descrito, pero alcance, registro y legalidad requieren definición.
- No se implementa biometría, almacenamiento de DNI, ubicación en tiempo real, cobro automático ni envío de datos personales a proveedores sin definir consentimiento, proveedor, seguridad y requisitos legales.
- El período de prueba profesional dura 30 días según el contexto; no asumir cobro automático al finalizar si no existe medio de pago y consentimiento explícito.
- Si una suscripción vence o la cuenta se suspende, las funciones profesionales pueden quedar bloqueadas y el perfil puede ocultarse, pero el contenido histórico no se borra por falta de pago.
- Los precios y límites de plan se deben gestionar desde una fuente configurable; no duplicarlos en código.
- No procesar pagos confiando solo en el frontend.
- Las acciones administrativas sensibles/destructivas deben confirmar y auditar actor, fecha, objeto, motivo y resultado.

---

# 3. Stack y arquitectura esperados

El stack indicado por el proyecto es:

- Node.js
- NestJS
- TypeScript
- PostgreSQL
- TypeORM
- API REST versionada
- Swagger/OpenAPI
- Passport/JWT donde resulte apropiado
- Jest y Supertest
- class-validator y class-transformer
- ESLint y Prettier
- Docker y Docker Compose para entorno local, si aportan valor
- Migraciones TypeORM
- Variables de entorno validadas
- GitHub Actions/CI como preparación

## Arquitectura

Proponé un **monolito modular en NestJS**, no microservicios.

La arquitectura debe separar responsabilidades:

- Controllers delgados.
- Services/casos de uso con reglas de negocio.
- Persistencia organizada mediante TypeORM y repositorios cuando resulte útil.
- DTOs de entrada/salida.
- Entities y migraciones.
- Guards, decorators, filters, interceptors, pipes y middleware comunes.
- Integraciones externas mediante contratos/adaptadores para evitar acoplamiento.
- Configuración centralizada y tipada.
- Tests unitarios, integración y e2e.
- Documentación de API y decisiones de arquitectura.

No agregues capas o patrones complejos sin justificar su necesidad. No generes archivos vacíos solo para completar una estructura de carpetas.

Prepará una propuesta de estructura de directorios y explicá el propósito de cada módulo.

---

# 4. Requisito prioritario: autenticación y cookies seguras

Quiero que la autenticación se planifique desde el inicio usando **cookies seguras**, no guardando tokens de autenticación en `localStorage` o `sessionStorage`.

Evaluá y recomendá un diseño coherente entre Next.js y NestJS. Debe describir explícitamente la alternativa elegida y sus consecuencias según los dominios/orígenes de despliegue.

## Diseñar el flujo completo

- Registro de cliente/profesional y validaciones.
- Login.
- Emisión de sesión/tokens.
- Lectura y validación de cookies en peticiones autenticadas.
- Renovación de sesión.
- Rotación de refresh token.
- Logout.
- Logout de todos los dispositivos/sesiones.
- Revocación de sesiones.
- Expiración y detección de reutilización de refresh tokens.
- Manejo de sesiones concurrentes en varios dispositivos.
- Recuperación y restablecimiento de contraseña.
- Verificación de email.
- Bloqueo/rate limit ante intentos repetidos.
- Cambios de rol, cambio de contraseña y efectos sobre sesiones.
- Cuenta suspendida, desactivada o pendiente de verificación.

## Cookies: evaluar y especificar

No te limites a recomendar “usar cookies”. Definí:

- Qué cookie o cookies existirán y qué función cumplen.
- Si el access token se guarda en cookie o si se opta por una sesión opaca; comparar brevemente opciones y recomendar una.
- Si el refresh token se almacena en cookie separada.
- Nombres de cookies por ambiente, con prefijo `__Host-` cuando las condiciones lo permitan.
- `HttpOnly`.
- `Secure` en producción.
- `SameSite` (`Lax`, `Strict` o `None`) con fundamento según el esquema real de dominios y flujos OAuth.
- `Path`.
- `Domain` (preferir no establecerlo si no hace falta; evaluar subdominios).
- `Max-Age`/`Expires`.
- Alcance y duración del access token y refresh token, proponiendo valores razonables como punto de partida y señalando que deben validarse.
- Cómo borrar correctamente cookies al hacer logout (mismos atributos/path/domain).
- Diferencias entre desarrollo local y producción.
- Qué datos nunca deben incluirse en cookies ni en JWT.

No fijes `SameSite=None` o `Domain` global sin explicar cuándo es realmente necesario. Evitá configuraciones contradictorias.

## CSRF, CORS y origen

Explicá el modelo de amenazas para autenticación por cookies. Definí:

- Si se necesita token CSRF (por ejemplo, patrón double-submit o token sincronizado) y en qué endpoints.
- Validación de `Origin`/`Referer` como defensa adicional, donde corresponda.
- Cómo proteger endpoints mutables y logout/refresh.
- Configuración de CORS con una allowlist exacta de frontend origins.
- `credentials: true` en NestJS y `credentials: 'include'` en el cliente, si aplica.
- Por qué no se debe usar `Access-Control-Allow-Origin: *` con credenciales.
- Diferencias entre same-site y cross-site; subdominios y dominios diferentes.
- Estrategia recomendada si frontend y backend se alojan en subdominios de un dominio común versus dominios totalmente separados.
- Qué cambia si Next.js usa un BFF/proxy o si el navegador llama directamente a NestJS.

No afirmes que `HttpOnly` por sí sola protege contra CSRF o XSS. Describí defensa en profundidad.

## Almacenamiento y control de sesiones

Proponé un esquema de persistencia de sesiones/refresh tokens que permita:

- Guardar un identificador de sesión y/o hash del refresh token, nunca el refresh token en texto plano.
- Rotación atómica.
- Revocación individual y global.
- Expiración.
- Registro de `userId`, fechas de creación/último uso, vencimiento, revocación, dispositivo/metadatos minimizados y motivo de revocación.
- Detectar reuse de un refresh token ya rotado y actuar de forma segura (por ejemplo, revocar la familia de tokens).
- Mantener varios dispositivos/sesiones según lo permitido.
- Evitar registrar cookies, tokens, contraseñas o secretos en logs.

Recomendá si la persistencia de sesiones debe ser una tabla `sessions` dedicada, una tabla de refresh tokens o una combinación; justificar.

## JWT y autorización

Si se eligen JWT, definir:

- Algoritmo permitido explícitamente; nunca aceptar algoritmo arbitrario del token.
- Validación de firma, `iss`, `aud`, `exp`, `nbf` si se usan, y `jti` cuando aporte.
- Claims mínimos: no incluir DNI, teléfono, dirección, información de verificación ni otros datos personales.
- Estrategia para invalidación/revocación y cambios de permisos/estado de usuario.
- Access token de vida corta.
- Refresh token con rotación y estado persistido.
- Guards de autenticación, roles y permisos.
- Decoradores `@Public`, `@Roles`/permisos y `@CurrentUser` si se justifican.
- Autorización por propiedad del recurso (ownership), no solo por rol.
- Denegación por defecto.
- Validar roles y estado real del usuario desde una fuente confiable; no confiar en roles enviados por el cliente.
- Evitar IDOR/BOLA, mass assignment y escalada de privilegios.

---

# 5. Datos y privacidad

Diseñá una estrategia de minimización y protección de datos.

Analizá datos como email, contraseña/hash, DNI, teléfono, domicilio, ubicación, documentos de identidad, certificados, medios, pagos y datos de sesión.

Definí para cada categoría:

- Necesidad funcional.
- Sensibilidad.
- Quién puede acceder.
- Qué se expone públicamente.
- Retención y borrado, si está definida.
- Protección recomendada (hash, cifrado en reposo/columna, control de acceso, etc.).
- Si requiere decisión del fundador o asesoría legal.

Las contraseñas se hashean con Argon2id o alternativa segura y mantenida; no se cifran reversiblemente. Los datos de tarjeta no se almacenan; se delegan al proveedor de pagos. Considerá cifrado autenticado para datos sensibles que deban recuperarse, claves fuera del repositorio y estrategia de rotación. Para campos cifrados que deban buscarse, evaluá cuidadosamente índices derivados como HMAC y sus riesgos.

No inventes una política legal de privacidad ni de retención. Marcá los puntos pendientes.

---

# 6. Modelo de datos y módulos

Proponé un modelo de entidades completo basado en la documentación funcional. Como mínimo, evaluá las siguientes áreas y sus relaciones:

## Identidad y perfiles
- `users`
- `customer_profiles`
- `professional_profiles`
- `admin_profiles` si se justifica
- `identity_verifications`
- `email_verification_tokens`
- `password_reset_tokens`
- `sessions` / `refresh_tokens`

Usuarios comparten datos de identidad y autenticación; perfiles específicos se separan. No dupliques atributos sin razón. Analizá rol mutuamente excluyente y cambio de rol/historial.

## Catálogo y territorio
- `professions`
- `professional_professions`
- `professional_service_areas`
- `provinces`
- `localities`
- `neighborhoods` si es necesario
- `professional_media`
- `professional_certifications`
- `professional_availability`
- `availability_exceptions`

## Solicitudes y trabajo
- `service_requests`
- `service_request_status_history`
- `quotes`
- `quote_items` si aplica
- `service_contracts`
- Estados explícitos y transiciones válidas; no permitir cambios arbitrarios desde el cliente.

## Conversaciones
- `conversations`
- `conversation_participants`
- `messages`
- `message_attachments`
- `message_reports`

Chat sin contratación posible según el contexto. Diseñar unicidad de conversación por pareja cliente-profesional, teniendo en cuenta que puede haber decisiones pendientes sobre reabrir/historial. Verificar participantes para cada lectura/escritura.

## Suscripciones y pagos
- `subscription_plans`
- `subscriptions`
- `subscription_history`
- `payments`
- `payment_events`

Planes y límites configurables. Webhooks idempotentes y verificados. Estados de pago y suscripción sin confiar en el frontend. No asumir cobros automáticos al final de prueba.

## Reputación y comunidad
- `reviews`
- `review_replies`
- `favorites`
- `forum_posts`
- `forum_replies`
- `forum_reactions`
- `forum_post_media`

## Operación
- `notifications`
- `notification_preferences`
- `reports`
- `strikes`
- `sanctions`
- `admin_audit_logs`
- `support_tickets`
- `support_messages`
- métricas/eventos de negocio cuando estén justificados.

Para cada entidad principal, proponé campos esenciales, tipos, restricciones, claves foráneas, índices, relaciones y reglas de integridad. No hace falta generar todavía todas las entidades TypeORM en código.

Entregá:
- Diagrama ER en Mermaid.
- Explicación de relaciones/cardinalidades.
- Entidades candidatas a transacciones.
- Índices y constraints críticos.
- Estrategia de migraciones.
- Política de UUID/fechas UTC/soft delete, con justificación.
- Estrategia para seeds de desarrollo sin datos personales reales.

---

# 7. Seguridad transversal obligatoria

Prepará un threat model de nivel inicial pero concreto para la plataforma. Considerá al menos:

- Acceso no autenticado a rutas privadas.
- IDOR/BOLA al cambiar IDs.
- Mass assignment y escalada de roles.
- Robo/reutilización de sesión y refresh token.
- CSRF.
- XSS y contenido de foro/chat.
- Fuerza bruta, credential stuffing y abuso de endpoints.
- Inyección SQL y consultas TypeORM inseguras.
- Subida de archivos maliciosos, MIME falso, tamaño excesivo y URLs inseguras.
- Webhooks falsos/repetidos de Mercado Pago.
- Abuso de permisos de administración.
- Exposición de DNI, teléfono, dirección, documentos y conversaciones.
- Filtración de secretos y dependencias vulnerables.
- Rate limits, logs y alertas.
- Copias de seguridad y acceso a PostgreSQL.

Proponé controles aplicables y tests que demuestren que funcionan.

Incluir, cuando sea apropiado:

- Configuración segura de NestJS (`ValidationPipe` con whitelist/forbidNonWhitelisted/transform, Helmet, CORS restrictivo, filtros de errores, límites de payload).
- Rate limiting por endpoint y/o identidad, con estrategia distribuida si en futuro hay múltiples instancias.
- Sanitización/escape de contenido según contexto, sin confiar en “sanitizar todo” como solución universal.
- DTOs de salida/serialización para evitar filtrar propiedades internas.
- Uploads mediante proveedor y validación real; evitar archivos ejecutables y traversal.
- Permisos mínimos de PostgreSQL y credenciales separadas para migraciones/runtime si el entorno lo permite.
- Auditoría de operaciones administrativas y sensibles.
- No guardar secretos en Git ni en logs.
- Manejo seguro de errores, sin stack traces/secretos en producción.
- Pruebas de seguridad automatizadas y checklist de producción.

No prometas que el sistema será “inhackeable”.

---

# 8. Integraciones externas y desacoplamiento

Diseñá interfaces/contratos y fases para:

- Mercado Pago (pagos, suscripciones, eventos/webhooks).
- Cloudinary o proveedor S3-compatible para medios.
- Email transaccional.
- Push notifications.
- Verificación de identidad.
- Google OAuth opcional.
- WhatsApp para notificaciones Premium, si finalmente se valida.
- Chatbot/agenda Premium como fase futura.

No inventes endpoints, SDKs, credenciales o políticas de proveedores. Para la planificación, indicá qué se puede implementar con mocks, qué depende de credenciales y qué requiere decisión del fundador. Los webhooks deben verificar autenticidad, idempotencia y consistencia de estado.

---

# 9. API REST y documentación

Proponé convenciones de API:

- Prefijo/versionado (por ejemplo `/api/v1`, sujeto a justificar).
- Convenciones de recursos y nombres.
- DTOs de request/response.
- Paginación, ordenamiento y filtros.
- Formato consistente de errores.
- Códigos HTTP.
- Autenticación de endpoints.
- Matriz de permisos por módulo/endpoint.
- Documentación Swagger/OpenAPI.
- Endpoints públicos, autenticados, de cliente, profesional y admin.
- Rutas de auth: registro, login, logout, refresh, sesión actual, logout de todos, verificación email, recuperación/restablecimiento; detallar método y propósito sin necesidad de escribir código.

La matriz de permisos debe incluir **rol + estado de cuenta/verificación + propiedad del recurso + estado de suscripción/plan** cuando corresponda.

---

# 10. Pruebas y calidad

Definí una estrategia realista por capas:

- Unit tests para reglas de negocio y servicios.
- Integration tests para persistencia, constraints y transacciones.
- E2E tests con Supertest para endpoints y flujos completos.
- Tests de autenticación/cookies:
  - login establece cookies con atributos esperados;
  - cookie HttpOnly no se expone en body;
  - endpoint privado rechaza sin sesión;
  - refresh rota token;
  - token viejo reutilizado es detectado;
  - logout revoca y limpia cookies;
  - CSRF/origin inválido es rechazado según el diseño;
  - sesiones de distintos usuarios no se mezclan.
- Tests de autorización:
  - usuario no autenticado;
  - cliente intentando acción de profesional;
  - usuario intentando acceder al recurso de otro;
  - profesional con plan vencido;
  - cuenta suspendida;
  - administrador con acción sensible auditada.
- Tests de pagos/webhooks idempotentes.
- Tests de subida de archivos.
- Lint, format, build y CI.

Para cada fase de implementación, especificá qué pruebas deben pasar antes de avanzar.

---

# 11. Despliegue y ambientes

El contexto de referencia contempla Next.js y NestJS separados, con frontend potencialmente en Vercel y backend/base de datos en Railway, aunque la decisión final puede variar.

Planificá:
- Desarrollo local.
- Testing.
- Staging si aporta valor.
- Producción.
- Docker Compose para PostgreSQL y servicios locales necesarios.
- Migraciones seguras por ambiente.
- Variables de entorno validadas.
- HTTPS.
- CORS/cookies acorde a dominios reales.
- Health checks y shutdown.
- Logs sin datos sensibles.
- Backup/restore.
- CI con GitHub Actions.
- Secret management y rotación.

No asumas que `localhost`, Vercel y Railway comparten el mismo comportamiento de cookies. Explicá qué configuración cambia entre local y producción.

---

# 12. Roadmap de implementación

Proponé un plan de desarrollo ordenado por dependencias y en etapas pequeñas. Como mínimo, analizá fases similares a:

1. Auditoría de documentos, decisiones pendientes y alcance.
2. Diseño de arquitectura, módulos y modelo ER.
3. Setup NestJS, configuración, lint, validación env, Swagger, logging, health.
4. PostgreSQL/TypeORM, migraciones, conexión y estrategia de desarrollo local.
5. Modelo de identidad, usuarios y perfiles.
6. Autenticación inicial: registro/login/logout con cookies y sesiones.
7. Refresh rotation, revocación, CSRF/CORS y gestión de sesiones.
8. Autorización: roles, ownership, estado de cuenta y guards.
9. Verificación email y recuperación de contraseña.
10. Catálogo, profesiones, ubicaciones y perfiles públicos.
11. Disponibilidad.
12. Solicitudes, presupuestos y contratos.
13. Chat, mensajes y adjuntos.
14. Planes/suscripciones y período de prueba.
15. Pagos y webhooks.
16. Reseñas/favoritos.
17. Foro.
18. Notificaciones.
19. Reportes/moderación/auditoría/soporte/admin.
20. Integraciones avanzadas (identidad, chatbot, agenda, push/WhatsApp).
21. Pruebas integrales, hardening y preparación de producción.

Podés reorganizar estas etapas si justificás la dependencia. No implementar todo junto. Cada fase debe tener:
- objetivo;
- alcance incluido;
- prerrequisitos;
- tareas;
- decisiones que bloquean;
- archivos/módulos que probablemente se crearán;
- pruebas;
- criterio de aceptación verificable;
- definición de “terminado”;
- riesgos.

Separá el **MVP de backend** del alcance posterior, pero no elimines capacidades de la visión integral. Si sugerís posponer funciones, explicá por qué y cómo se preservan en el diseño.

---

# 13. Formato obligatorio de tu respuesta

Entregá un documento Markdown organizado y suficientemente profundo, con esta estructura:

1. Resumen ejecutivo.
2. Fuentes leídas y límites del análisis.
3. Requisitos y reglas funcionales consolidadas.
4. Tabla de decisiones confirmadas / pendientes / contradicciones / riesgos.
5. Arquitectura recomendada y justificación.
6. Estructura de carpetas propuesta.
7. Módulos backend y responsabilidades.
8. Modelo de datos:
   - entidades;
   - campos esenciales;
   - relaciones;
   - constraints e índices;
   - diagrama Mermaid ER;
   - transacciones.
9. Diseño detallado de autenticación con cookies:
   - arquitectura elegida;
   - flujos de login/refresh/logout;
   - cookies y atributos por entorno;
   - sesiones y persistencia;
   - CSRF;
   - CORS/origin;
   - JWT/claims/validaciones;
   - seguridad y amenazas;
   - casos de prueba.
10. Matriz de permisos por rol, verificación, propiedad y plan/estado.
11. Convenciones REST y propuesta de endpoints.
12. Integraciones externas y contratos.
13. Seguridad transversal y threat model.
14. Estrategia de pruebas.
15. Ambientes, Docker, migraciones y despliegue.
16. Roadmap por fases con criterios de aceptación.
17. Lista priorizada de preguntas al fundador.
18. Recomendaciones para comenzar en Claude Code.

Incluí tablas y diagramas Mermaid donde aporten claridad. El documento debe poder guardarse como `PLAN_BACKEND_REPARA_YA_NEXO_PRO.md`.

---

# 14. Reglas para la calidad de la respuesta

- Respondé en español, con términos técnicos claros.
- No me des una respuesta superficial ni una lista genérica de buenas prácticas.
- No generes código de implementación todavía.
- No repitas todo el contenido funcional literalmente: sintetizalo sin perder requisitos y señalá las fuentes.
- No inventes datos, secretos, credenciales, precios, políticas ni proveedores confirmados.
- Evitá decisiones arquitectónicas innecesariamente complejas.
- Cuando haya varias opciones, compará brevemente y recomendá una con razones.
- Las cookies son un requisito de diseño importante: no las trates como un detalle posterior.
- No digas que una cookie HttpOnly elimina XSS o CSRF.
- No propongas guardar tokens de autenticación en localStorage/sessionStorage.
- No afirmes que el sistema será completamente seguro.
- Si una decisión sensible requiere mi aprobación, presentá alternativas y detené esa parte del plan.
- Priorizá un plan que pueda aprender, revisar y ejecutar por etapas con Claude Code.

**Comenzá por confirmar qué documentos pudiste leer. Luego entregá el análisis y la planificación, sin programar.**
