# REPARA YA / NEXO PRO
## Especificación funcional integral — Flujo de aplicación y reglas de negocio para Claude Code

**Versión:** 2.0 — 02/11/2026  
**Estado:** Documento de contexto funcional consolidado. No equivale a autorización para implementar sin revisar decisiones marcadas como pendientes o riesgosas.

---

## Cómo debe utilizar Claude Code este documento

Este documento reúne (1) la descripción funcional previa de “flujo de la app” y (2) el cuestionario de definición de negocio respondido por el fundador. El contenido debe considerarse contexto principal del producto.

### Reglas de trabajo para Claude Code
1. Leer este archivo completo antes de proponer arquitectura, entidades, rutas, componentes o código.
2. No borrar, simplificar ni reemplazar funcionalidades por decisión propia. Si el alcance es grande, proponer fases técnicas sin eliminar la visión funcional.
3. Separar claramente: **decisiones expresas del fundador**, **decisiones por definir**, **riesgos/contradicciones** y **propuestas técnicas**.
4. No inventar reglas comerciales, textos legales, precios, políticas de datos o permisos. Consultar cuando falte una definición.
5. Respetar la arquitectura y las convenciones técnicas del proyecto que se indiquen en otros documentos del repositorio. No duplicar ni contradecir sus reglas.
6. La interfaz debe ser responsive, cuidada, moderna, accesible y coherente; las acciones sensibles deben requerir confirmación y mostrar feedback claro.
7. La autorización debe comprobarse en backend; ocultar botones en frontend no constituye seguridad.
8. Mantener trazabilidad de pagos, suscripciones, cambios de rol, moderación, reportes y acciones administrativas.
9. No integrar cobros automáticos, identidad biométrica, ubicación en tiempo real ni envío de datos personales hasta validar proveedor, consentimiento, seguridad y aspectos legales.
10. Ante ambigüedades relevantes, presentar opciones y pedir decisión antes de implementar.

### Leyenda
- **Confirmado:** el fundador respondió expresamente.
- **Pendiente:** no está resuelto o requiere validación.
- **Riesgo/contradicción:** dos respuestas pueden entrar en conflicto o la regla puede producir un resultado delicado; no resolverlo silenciosamente.

---

# Índice de lectura

1. Visión y objetivos
2. Principios del producto
3. Roles y permisos
4. Visitante no autenticado
5. Registro, autenticación y verificación
6. Modelo de negocio, prueba y planes
7. Perfil profesional
8. Perfil del cliente y privacidad
9. Catálogo, búsqueda y ranking
10. Disponibilidad y horarios
11. Solicitudes, propuestas y contratación
12. Chat y comunicación
13. Foro general
14. Reputación, reseñas y clasificación
15. Notificaciones
16. Chatbot y agenda Premium
17. Dashboard del cliente
18. Dashboard del profesional
19. Panel de administración
20. Reportes, strikes y sanciones
21. Soporte, contacto y novedades
22. Ciclos de vida y casos de uso end-to-end
23. Datos, eventos y métricas de negocio
24. Lanzamiento y crecimiento
25. Seguridad, privacidad y revisión legal
26. Flujos críticos y estados sugeridos
27. Riesgos, contradicciones y decisiones pendientes
28. Fases de implementación sugeridas
29. Contexto funcional previo completo
30. Cuestionario respondido como fuente de trazabilidad

---

# 1. Visión y objetivos

**Repara Ya / Nexo Pro** es una plataforma web (con posibilidad de app en el futuro) que conecta personas que necesitan resolver tareas o contratar servicios con profesionales de distintos oficios. El lanzamiento inicial está pensado para **Córdoba Capital**, con cobertura según la zona declarada por cada profesional y la ubicación que comparta el cliente.

El negocio se basa principalmente en suscripciones mensuales de profesionales. La plataforma no cobra comisión por trabajo: el profesional conserva el **100 % del importe que acuerde directamente con el cliente**. El producto busca combinar catálogo, perfiles, comunicación, solicitudes, foro comunitario, reputación, notificaciones, herramientas Premium y administración.

La marca aparece en las respuestas como **Repara Ya / Nexo Pro**. La denominación final todavía debe confirmarse; en este documento se utilizan ambos nombres para referirse al mismo producto.

# 2. Principios del producto

- Experiencia fluida y autogestionada entre cliente y profesional.
- Catálogo visible también para personas no registradas.
- La comunicación y los acuerdos de precio, fecha, domicilio y alcance del trabajo se realizan entre las partes, principalmente mediante chat.
- La plataforma facilita el encuentro y la gestión, pero no define el precio del servicio ni garantiza el resultado del trabajo.
- Los profesionales pueden mostrar su experiencia, reputación, contenido visual, disponibilidad y certificaciones.
- El acceso a funciones de profesional depende del estado de la suscripción.
- La administración tiene herramientas amplias de moderación y gestión, con registro de acciones.
- La protección de datos, identidad, pagos y reglas legales deben definirse e implementarse con especial cuidado; el fundador indicó que la sección legal se resolverá con asesoría de un abogado calificado.

# 3. Roles y permisos

## 3.1 Visitante no registrado
Puede:
- Navegar por la página pública y el catálogo de profesionales.
- Ver perfiles públicos, datos que el profesional haya decidido exponer, contenido multimedia, certificaciones públicas, reseñas y reputación.
- Usar filtros de búsqueda que no requieran autenticación o ubicación autorizada.
- Ver publicaciones del foro y sus respuestas; el fundador quiere que la observación pública de la conversación sea parte de la experiencia.
- Ver la información pública de Repara Ya/Nexo Pro.

No puede:
- Iniciar o continuar un chat.
- Solicitar o contratar un servicio.
- Publicar, comentar, reaccionar, dar “me gusta”, reportar mediante una cuenta o guardar favoritos/búsquedas.
- Acceder a dashboards ni a datos privados.
- Crear interacciones que requieran identidad verificada.

CTA esperados: registrarse/iniciar sesión para interactuar, contactar, publicar, guardar o solicitar un servicio.

## 3.2 Cliente registrado y verificado
Puede:
- Explorar el catálogo y perfiles.
- Iniciar un único chat/conversación con cada profesional.
- Enviar solicitudes a uno o varios profesionales y decidir cuál contratar.
- Conversar, enviar imágenes/videos, negociar y coordinar datos del servicio.
- Cancelar solicitudes o contrataciones según su estado.
- Publicar consultas o solicitudes de profesionales en el foro, responder, reaccionar, editar/eliminar contenido propio y reportar.
- Guardar profesionales favoritos y activar avisos de disponibilidad.
- Calificar y reseñar profesionales y responder/gestionar sus propias reseñas según las reglas.
- Administrar sus datos, ubicación y preferencias de notificaciones.
- Consultar sus secciones de solicitudes, conversaciones recientes, favoritos, notificaciones y reseñas pendientes.
- Reportar usuarios, perfiles, mensajes, publicaciones o reseñas.
- Solicitar revisión de una clasificación o sanción.

No puede:
- Tener simultáneamente el rol cliente y profesional activo. El usuario puede cambiar de rol posteriormente, pero no operar ambos a la vez.
- Ver datos de otros clientes fuera de la información pública que el propio cliente publique en el foro.
- Ver dirección exacta de otro cliente antes de que exista una contratación y se acuerde compartirla.
- Modificar o eliminar contenido de terceros.

## 3.3 Profesional registrado y verificado
Puede:
- Crear y administrar un perfil público.
- Elegir profesión principal y profesiones secundarias según su plan.
- Definir zona de cobertura, tarifa de referencia, modalidad de cobro, experiencia, equipo, presupuesto de visita y horarios.
- Administrar contenido, fotos, videos, certificados y personalización dentro de los límites del plan.
- Cambiar manualmente su estado de atención y definir horarios que puedan automatizarlo.
- Recibir y responder solicitudes, conversar con clientes y acordar directamente el trabajo.
- Gestionar estados de contratación conforme al flujo acordado.
- Responder reseñas, participar en foro, reportar clientes, consultar métricas cuando el plan lo permita.
- Administrar su suscripción, historial de pagos y plan.
- Usar chatbot/agenda únicamente en Premium y según las opciones habilitadas.

No puede:
- Iniciar chats con clientes en la primera versión; el cliente siempre inicia.
- Usar funciones de profesional cuando su suscripción haya vencido, esté impaga o su cuenta esté suspendida.
- Ocultar públicamente teléfono o email del perfil en la primera versión: ambos se muestran públicamente según la decisión del fundador.
- Cambiar unilateralmente reglas de plataforma o sus propios límites de plan.

## 3.4 Administrador / fundador
Al inicio habrá un único administrador con todos los permisos. Puede:
- Consultar y administrar información de clientes, profesionales, planes, suscripciones, pagos, perfiles, contenido, reseñas, verificaciones, reportes, sanciones y métricas.
- Aprobar/rechazar verificaciones y revisar certificados.
- Cambiar manualmente el plan de un profesional solo mediante acuerdo mutuo; la baja manual de plan no se espera salvo solicitud expresa del profesional.
- Enviar mensajes individuales, publicar novedades, segmentar anuncios por rol/profesión/plan y enviar a todos.
- Ocultar/eliminar publicaciones, comentarios, imágenes, videos, reseñas o cuentas; restaurar cuentas suspendidas/eliminadas cuando corresponda.
- Consultar chats en caso de reporte, denuncia o revisión administrativa; el alcance de acceso debe validarse legalmente.
- Resolver reportes, decidir validez de strikes, revisar apelaciones y autorizar reincorporaciones.
- Ver historial administrativo y auditar eventos.
- Gestionar profesiones del catálogo; los usuarios no pueden proponer nuevas profesiones directamente.

Las acciones destructivas o sensibles deben solicitar confirmación y registrar actor, fecha, objeto, motivo y resultado.

# 4. Flujo del visitante no autenticado

1. Ingresa a la landing/página pública.
2. Puede conocer la propuesta de valor, explorar oficios y acceder al catálogo general o a una categoría.
3. Puede filtrar por profesión, localidad/barrio, reputación, trabajos realizados, verificación, disponibilidad y “Cerca de mí” cuando autorice ubicación.
4. Puede abrir el detalle público de un profesional y consultar su presentación, descripción, imágenes/videos, certificados, horarios/estado, áreas de cobertura, precios orientativos, reseñas y formas de contacto publicadas.
5. Puede leer el foro, publicaciones y respuestas públicas.
6. Cuando intenta iniciar chat, solicitar servicio, reaccionar, publicar, guardar favoritos/búsquedas o activar notificaciones, se le invita a registrarse/iniciar sesión.
7. Si se registra, debe completar verificación antes de operar. No puede interactuar mientras la verificación esté pendiente.

# 5. Registro, autenticación y verificación

## 5.1 Reglas de registro
Datos obligatorios para cliente y profesional:
- Nombre y apellido.
- Foto de perfil.
- Email.
- DNI.
- Teléfono.
- Provincia, localidad y barrio.

Para profesional se exige además profesión/oficio. Google OAuth es una opción para mejorar la UX, no un requisito obligatorio. Se permitirán sesiones en varios dispositivos.

La recuperación de acceso se plantea mediante soporte que restablece credenciales; es un flujo pendiente de diseñar con medidas seguras y sin exponer datos.

## 5.2 Exclusividad de rol
Una cuenta puede operar como cliente o profesional, nunca ambos a la vez. Se permite cambiar de rol posteriormente. El proceso de cambio de rol, tratamiento de datos/historial y efecto sobre suscripción profesional debe definirse antes de implementación.

## 5.3 Verificación
El fundador quiere:
- Verificación de identidad mediante DNI frente/reverso y selfie/validación facial, de forma similar a una verificación bancaria, si existe una solución viable.
- La verificación sería automática para la plataforma y podría requerir revisión manual para cliente/profesional.
- El profesional puede presentar certificados de formación opcionales. El administrador los revisa y pueden mostrarse públicamente.
- No se mostrarán públicamente los datos privados de verificación; se usarán como señales internas y para distintivos.
- No se puede crear una cuenta operativa ni navegar/interactuar si no se completa la verificación.

**Pendiente crítico:** proveedor, almacenamiento, consentimiento, seguridad, borrado/retención, validación de identidad y marco legal. No implementar biometría ni retención de DNI por conjetura.

## 5.4 Cuentas duplicadas y comprometidas
El fundador propone bloquear cuentas iguales o similares y sancionar la creación de cuentas nuevas tras una sanción. La detección exacta está pendiente. Si una cuenta es comprometida, se propone dar de alta una nueva cuenta con los días restantes de plan; este flujo debe diseñarse evitando duplicación de historial, pagos o identidad.

# 6. Modelo de negocio, prueba y planes

## 6.1 Modelo comercial
- Suscripción mensual obligatoria para profesionales.
- Cliente gratuito durante el primer mes desde su registro, con el alcance descrito por el fundador; **el acceso gratuito del cliente y la relación con los planes profesionales requieren precisión**, ya que el cuestionario menciona también “plan Basic” y el bloqueo de Nexo Pro al no pagar.
- Sin comisión por trabajos.
- Profesional conserva el 100 % del dinero acordado.
- Precios en ARS, un único importe publicado que incluye impuestos.
- Valores inicialmente fijos, con posibilidad de modificación futura.
- Mercado Pago como medio principal inicial; tarjetas de débito podrían evaluarse luego.
- Posibles ingresos futuros por publicidad o posicionamiento patrocinado.
- Posible multa de $8.000 ARS vinculada a reincorporación tras baneo por strikes; requiere validación legal y definición de aplicación.

## 6.2 Período de prueba profesional
- Todos los profesionales pueden tener 30 días de prueba desde el registro.
- No se exige medio de pago al comenzar la prueba.
- El profesional debe completar/actualizar su perfil durante la prueba; el cuestionario indica que si no actualiza el perfil durante ese período pierde la prueba. **Debe definirse qué actividad concreta cuenta como “actualizar” y cuándo se pierde el beneficio.**
- Debe verse un contador de días restantes en el dashboard.
- Al terminar los 30 días se solicita pago para continuar.
- El fundador respondió que podría configurarse cobro automático al finalizar y avisarse en términos y condiciones. Esto entra en tensión con la respuesta de no pedir tarjeta antes de los 30 días: no cobrar automáticamente si no hay medio de pago válido ni consentimiento explícito.
- Si no contrata un plan, el perfil se oculta del catálogo y se muestra un mensaje como “Elegí un plan para continuar”.
- No se borra el perfil ni su contenido histórico por falta de pago.
- No se permite obtener otra prueba mediante cuenta duplicada; detección y apelación deben definirse.

## 6.3 Planes y límites
Precios de referencia del contexto del producto: Basic $10.000 ARS, Medium $15.000 ARS y Premium $20.000 ARS por mes. Confirmar vigencia antes de mostrar valores productivos.

| Funcionalidad | Basic | Medium | Premium |
|---|---|---|---|
| Profesiones habilitadas | 1 | Hasta 2 | Hasta 3 |
| Contenido visual | 2 imágenes de presentación + 3 de trabajos (5 total) | 2 de presentación + 3 de trabajos y 1 video | 4 imágenes + 2 videos (uno de presentación en catálogo y otro de presentación del profesional) |
| Video | No indicado | 1 video, máx. 15 s | 2 videos, máx. 15 s cada uno |
| Plantilla visual | Predeterminada | Personalización de colores, gradientes, tipografías, banner y textos | Personalización ampliada: colores, gradientes, tipografías, efectos, animaciones y transiciones por contenedor; banner con imagen o video |
| Ranking | Posición base dentro del catálogo | Preferencia de exposición junto con perfiles de 4–5 estrellas; prioridad en orden “mejores valorados” | Posicionamiento superior al Medium |
| Aviso cuando vuelve a estar disponible | No | Sí | Sí |
| Métricas del perfil | No | No confirmado | Sí |
| Chatbot/agenda | No | No | Sí |
| Certificados | Admitidos en todos los planes | Admitidos | Admitidos |

**Aclaración de contenido Premium:** el fundador describió el video de presentación en catálogo como una pieza breve y llamativa (por ejemplo, el profesional caminando hacia cámara y cerrando con una pose confiada y sonrisa). Esto es una sugerencia creativa, no requisito obligatorio.

Los archivos admitidos inicialmente: PNG, JPG y MP4. Peso y resolución máximos se definirán por optimización. Videos públicos para visitantes registrados y no registrados. El admin puede retirar contenido ofensivo y avisar al profesional; no se exige aprobación previa.

## 6.4 Cambio de plan, cancelación y vencimiento
- Puede subir de plan cuando paga; el cambio se aplica inmediatamente.
- Si sube de plan dentro de los primeros 10 días desde el pago del plan actual, abona solo la diferencia.
- Pasados esos 10 días, no puede cambiar hasta completar los 30 días del plan vigente; luego paga el total del plan nuevo.
- No existe “bajar de plan” directamente: puede desuscribirse para detener débitos y mantener el plan hasta que termine el período ya pagado.
- Al finalizar el período cancelado, el perfil se oculta.
- El administrador puede cambiar el plan por acuerdo mutuo.
- Si un plan no habilita cierto contenido, el usuario no ve la opción de cargarlo.
- Al cambiar de plan, el contenido excedente se bloquea/oculta según límites; al mejorar, se habilitan las opciones y se puede agregar contenido.
- Se conserva perfil, reseñas e historial para una futura reactivación.
- Una sola suscripción activa por cuenta profesional.

## 6.5 Impago
- Perfil oculto al público; no se elimina.
- No puede recibir solicitudes, enviar/responder mensajes, consultar chats anteriores, responder clientes, usar funciones profesionales ni gestionar trabajos activos.
- El foro queda en modo lectura, como visitante no registrado.
- Datos de clientes con contrataciones activas solo podrán entregarse si el profesional lo solicita y el administrador decide autorizarlo.
- Puede contratar un plan nuevamente.
- Si pasan 30 días sin pagar, el cuestionario menciona interés del 3 % al recontratar. **Pendiente definir base, periodicidad, legalidad y forma de cálculo; no implementar automáticamente sin validación.**
- Si el pago falla temporalmente, se genera incidencia para soporte.
- La baja voluntaria mantiene acceso hasta el fin de los 30 días abonados; luego oculta perfil.
- La falta de pago no borra reseñas, contenido o historial.

# 7. Perfil profesional

## 7.1 Datos y presentación
- Nombre y apellido siempre visibles.
- Puede añadir nombre comercial opcional.
- Foto de perfil obligatoria.
- Email y teléfono visibles públicamente en la primera versión.
- Descripción limitada a 200 caracteres.
- Años de experiencia.
- Zona(s) de cobertura.
- Trabaja solo o con equipo.
- Tarifa de referencia y modalidad: por visita, hora o trabajo completo.
- Indicar si ofrece presupuesto gratuito.
- Profesión principal y secundarias conforme al plan.
- Un catálogo general de profesiones; al seleccionar un oficio, la página se personaliza visualmente/contextualmente.
- No se pueden proponer profesiones nuevas desde el perfil; el admin las administra.

## 7.2 Certificados
- Opcionales, públicos y visibles para todos los planes.
- El admin revisa los certificados.
- Pueden incrementar la confianza del cliente.
- El admin puede aprobar, rechazar u ocultar según reglas por definir.

## 7.3 Contenido y personalización
- El contenido permitido depende del plan y límites de la tabla anterior.
- El profesional puede ordenar, editar, reemplazar y eliminar sus medios.
- El admin puede ocultar medios inadecuados y notificar.
- Los límites técnicos de tamaño, resolución, duración y almacenamiento quedan pendientes.
- Las personalizaciones Medium/Premium deben usar controles y plantillas acotadas para preservar legibilidad y accesibilidad; no permitir CSS libre arbitrario.
- La configuración visual no debe comprometer la experiencia del usuario final.

# 8. Perfil del cliente y privacidad

- Foto de perfil obligatoria.
- El cliente no puede ver datos de otros clientes, salvo los datos públicos de autoría en el foro.
- El profesional puede abrir el perfil del cliente o chat cuando el cliente lo contacta.
- La dirección exacta se comparte solo cuando existe contratación y se acuerda compartirla.
- El cliente puede compartir ubicación en tiempo real mientras la app está en uso, si el cliente o profesional lo autoriza; puede desactivarla.
- El profesional puede guardar/descargar datos del cliente según la respuesta del fundador, sujeto a permisos y revisión legal.
- Historial de contrataciones se conservaría siempre según el cuestionario.
- El cliente puede eliminar su cuenta; reseñas, publicaciones y contrataciones se borrarían u ocultarían según política aún no definida.
- En foro se muestran nombre, apellido, foto, fecha de registro, fecha de publicación y contenido.
- Clasificación pública/visible para profesionales: “Exigente” (promedio 1–2 estrellas otorgadas por profesionales), “Normal” (3–4), “Fácil de complacer” (5). Cliente también puede conocerla y solicitar revisión.
- El fundador indica que esta clasificación no debe impedir contratar, pero puede motivar a mejorar. Debe evitarse usarla como penalización automática o mecanismo discriminatorio; reglas de revisión y transparencia son pendientes de definición.

# 9. Catálogo, búsqueda y ranking

## 9.1 Catálogo y filtros
- No mostrar profesionales con suscripción vencida.
- Mostrar disponibles y no disponibles; el cliente puede contactar o esperar.
- Filtros combinables:
  - Profesión/oficio.
  - Localidad, barrio o zona (no código postal).
  - “Cerca de mí” con permiso de ubicación.
  - Radio aproximado de 5 a 10 km, con control range; el radio exacto queda por definir.
  - Distancia calculada respecto de ubicación del cliente o zona declarada por profesional.
  - Disponibilidad “Disponible ya”.
  - Verificado sí/no.
  - Valoración, ascendente/descendente.
  - Número mínimo de trabajos realizados (valor numérico).
- Si no se autoriza ubicación, el filtro “Cerca de mí” aparece destacado/deshabilitado con aviso; el resto del catálogo y el contacto siguen disponibles.
- Posibilidad de paginación o carga progresiva pendiente.
- Cuando no haya resultados, mostrar mensaje claro y sugerir otras zonas/profesiones.
- El usuario puede guardar búsquedas y recibir avisos cuando aparezcan profesionales disponibles; detalle de preferencias/canales pendiente.

## 9.2 Ordenamiento y exposición
- Basic aparece junto con todos los perfiles.
- Medium se destaca/puede aparecer entre perfiles de 4–5 estrellas y recibe prioridad en el filtro “mejores valorados”.
- Premium tiene prioridad superior a Medium.
- Patrocinados, si se habilitan, deben identificarse claramente; el fundador menciona marcos de colores y video de presentación.
- Evitar mostrar siempre los mismos profesionales mediante señales como puntuaciones, trabajos reales, visitas al detalle por usuarios registrados/no registrados, agregadas por día/semana/mes.
- Los pesos y algoritmo de ranking están pendientes; no inferir que ubicación, disponibilidad o cantidad de trabajos necesariamente cambian ranking, porque el fundador no entendió esa pregunta.
- Publicidad/posicionamiento pago por zona o búsqueda es una idea futura, no requisito confirmado.

# 10. Disponibilidad y horarios

Estados visibles:
- **Disponible:** abierto a recibir solicitudes en ese momento; puede responder con mayor inmediatez.
- **Trabajando / En servicio:** ocupado; el cliente entiende que puede demorar.
- **Descansando:** no se espera respuesta inmediata.

Reglas:
- El profesional puede cambiar manualmente su estado.
- También puede programar horarios semanales, días de descanso, feriados y vacaciones; el sistema puede actualizar estado automáticamente según esos horarios.
- El estado “Disponible” puede tener vencimiento basado en la configuración del profesional.
- Los horarios son iguales para todas sus profesiones; no hay disponibilidad distinta por oficio.
- El sistema no cambia el estado por tener una contratación activa, aunque el fundador respondió que el profesional pasa a “Trabajando” al aceptar una solicitud y no puede estar disponible mientras trabaja. **Resolver esta tensión antes de codificar:** regla propuesta para revisión: aceptación de solicitud actualiza a “Trabajando”, con posibilidad de gestionar múltiples trabajos y agenda.
- Si llegan varias solicitudes, el profesional conversa y acuerda con los clientes; puede aceptar una y rechazar otras o coordinar secuencialmente.
- Notificaciones de vuelta a disponibilidad solo Medium/Premium.
- Cliente puede seguir profesionales y administrar avisos en su dashboard; puede desactivar avisos generales o por profesional.
- Si el profesional no actualiza su estado durante varios días, no se aplica una sanción automática.

# 11. Solicitudes, propuestas y contratación

## 11.1 Inicio
- El cliente inicia desde CTA de tarjeta o detalle del profesional; la profesión queda implícitamente seleccionada.
- El CTA inicia un chat y solicitud vinculada; también puede existir conversación solo para consulta, sin contratación.
- Descripción, fotos/videos del problema, ubicación, domicilio, fecha, horario, urgencia, presupuesto y detalles se acuerdan por chat.
- Urgencia sugerida: “Puede esperar”, “Impaciente”, “Urgente”; definición de semántica y consecuencias pendiente.
- Cliente puede enviar solicitudes a varios profesionales.
- Cada profesional recibe notificación inmediata y chat correspondiente.
- Cliente puede cancelar antes de respuesta; el sistema agrega mensaje automático: “Ya lo solucioné, disculpas por la molestia”.
- Cliente siempre inicia la conversación en primera versión.
- Un único chat por pareja cliente-profesional.

## 11.2 Selección del profesional
- El profesional puede conversar, solicitar más información, enviar/editar presupuestos, proponer fechas y negociar; todos los acuerdos se autogestionan por chat.
- Una solicitud puede recibir varias ofertas/propuestas, pero finalmente solo un profesional es seleccionado para ese trabajo.
- Cuando el cliente elige a uno, los otros profesionales que habían seleccionado/atendido la solicitud reciben un mensaje informativo: “El cliente {nombre} ya seleccionó a un profesional”.
- El cliente puede libremente contactar a otros profesionales; la plataforma no impone exclusividad de negociación.
- El precio y los términos los acuerdan cliente y profesional; la plataforma no cobra comisión ni arbitra el precio.

## 11.3 Estados recomendados para revisión
El fundador no fijó un catálogo exacto de estados. Para dar estructura sin asumir decisión, considerar como propuesta:
1. `REQUESTED` — solicitud iniciada.
2. `AWAITING_PROFESSIONAL` — pendiente de respuesta.
3. `DISCUSSION` — conversación/diagnóstico en curso.
4. `QUOTE_SENT` — presupuesto comunicado.
5. `ACCEPTED` — cliente y profesional acuerdan proceder.
6. `SCHEDULED` — fecha/hora acordadas.
7. `IN_PROGRESS` — servicio iniciado.
8. `COMPLETED` — profesional marca finalizado.
9. `CANCELLED_BY_CLIENT` / `CANCELLED_BY_PRO` — cancelación.
10. `REPORTED` / `UNDER_REVIEW` — reporte grave o revisión administrativa.

**Importante:** esto es una propuesta de modelado, no un conjunto de estados aprobado. En el cuestionario, solo profesionales pueden cambiar estados, aunque clientes pueden cancelar solicitudes/contrataciones; se debe definir el mapa de transiciones, permisos y acciones exactas antes de implementarlo.

## 11.4 Finalización, reseña y reapertura
- Profesional puede marcar trabajo finalizado.
- No se requiere confirmación del cliente para cerrar.
- Si el cliente considera que no se realizó o quedó parcial, puede reportar y dejar reseña negativa.
- Para repetir el servicio se crea una nueva contratación; no se reabre una anterior.
- No se guarda historial completo de cada cambio de estado según respuesta del fundador; se conserva historial de clientes atendidos por profesionales y profesionales contratados por clientes. Sin embargo, eventos críticos deben auditarse por seguridad y soporte: confirmar con fundador qué historial operativo quiere conservar.
- Cancelaciones pueden ser realizadas por cliente o profesional; justificación opcional pero recomendada.
- Cancelaciones reiteradas pueden generar penalizaciones; reglas pendientes.
- No presentación del profesional: cliente puede reportar y reseñar.
- Cliente ausente: profesional puede reportar, reseñar o contactar para confirmar ubicación.
- Desacuerdos de precio se resuelven entre las partes; reportes graves/críticos pueden ser revisados por admin.
- La plataforma no promete mediación general. Las reseñas pueden publicarse con respeto y pueden reportarse.

# 12. Chat y comunicación

- Solo clientes pueden iniciar chats en la primera versión.
- Cliente puede escribir a cualquier profesional registrado/activo, incluso antes de contratar.
- Profesional no puede iniciar un chat nuevo sin contacto previo del cliente.
- Chat asociado a solicitud/contratación cuando corresponda, pero puede ser una consulta independiente.
- Solo dos participantes: cliente y profesional.
- Un solo chat por pareja.
- Admite texto, imágenes y videos; documentos solo como imágenes.
- No admite mensajes de voz.
- Se puede mostrar estado en línea y confirmación de lectura.
- Mensajes pueden editarse/eliminarse; pueden reportarse.
- Chat continúa luego de finalizar trabajo; no se borra al finalizar.
- Historial de chat se elimina tras un mes según respuesta del fundador; **retención y borrado deben validarse legalmente y coordinarse con reportes/denuncias**.
- Admin puede revisar conversaciones ante reporte/disputa.
- Compartir teléfono, email o enlaces externos queda a criterio de las partes y bajo precauciones, según términos.
- Prevenir spam/estafas si existe solución viable; no afirmar que se garantiza prevención.
- Profesional sin plan: no puede usar chat ni consultar conversaciones previas; su acceso queda equivalente a visitante para funcionalidades profesionales, aunque los chats pueden conservarse en backend por período definido. Esta regla debe coordinarse con retención legal.

# 13. Foro general

## 13.1 Tipos de publicación
- **Consulta** y **Solicito Profesional**.
- Mostrar nombre, apellido, foto, fecha de publicación, fecha de registro del autor, descripción y foto opcional.
- Hasta 2 imágenes y 1 video menor a 15 segundos.
- Etiquetas opcionales: hasta 4 profesiones.
- Ubicación/zona, presupuesto estimado y fecha límite son opcionales.
- No hay vencimiento automático.
- Autor puede editar/eliminar y marcar resuelta.
- Al marcar resuelta, deja de permitir nuevos comentarios; la publicación puede permanecer visible.
- Respuestas visibles públicamente incluso para visitantes no registrados.
- Clientes y profesionales pueden responder libremente, proponer presupuestos, responder comentarios y mantener conversación anidada sin límite funcional explícito.
- Respuestas pueden mostrarse en desplegables; se pueden editar/eliminar si son propias.
- Se permiten reacciones/me gusta.
- Autor recibe notificación por respuestas; también notificar a profesional cuando le respondan.
- Publicaciones/comentarios pueden reportarse; admin puede eliminarlos/ocultarlos.
- Al eliminar publicación, respuestas se eliminan en cascada según la respuesta del fundador. Considerar confirmación y retención de evidencia de moderación.

## 13.2 Acceso
Visitante puede leer. Cliente/profesional autenticado puede crear, responder, reaccionar y reportar. Profesional con suscripción vencida puede solo visualizar, como visitante no registrado.

# 14. Reputación, reseñas y clasificación

## 14.1 Reseñas de profesionales
- Calificación de 1 a 5 estrellas.
- El fundador indicó que la reseña puede dejarse en cualquier momento; solo una reseña por servicio solicitado/contratación.
- Reseña escrita opcional con límite de caracteres pendiente.
- Sin imágenes adjuntas.
- Profesional puede responder públicamente.
- Autor puede editar o eliminar su propia reseña; nadie puede modificar reseñas ajenas.
- Profesional puede reportar una reseña; admin puede ocultar/eliminar.
- Mostrar promedio y cantidad de reseñas; reseñas recientes tienen prioridad.
- Promedio se calcula a partir de reseñas válidas.
- Reseñas de profesional impago quedan ocultas mientras el perfil esté oculto; se conservan para reactivación.
- Reseñas de servicios cancelados: pendiente.
- Se permite una reseña por servicio solicitado.
- Clientes pueden calificar en estrellas aspectos globales; detalle adicional en texto opcional.
- También se pueden reseñar la plataforma; admin puede administrar visibilidad, principalmente públicas.

## 14.2 Clasificación de clientes
Según respuestas del fundador:
- 1–2 estrellas promedio otorgadas por profesionales: **Exigente**.
- 3–4: **Normal**.
- 5: **Fácil de complacer**.
- La clasificación es visible para profesionales y también para el propio cliente.
- Puede solicitar revisión y reportar uso discriminatorio/abusivo.
- No debe bloquear contratación.
- **Riesgo importante:** usar etiquetas basadas en promedios pequeños o subjetivos puede producir sesgo/abuso. Antes de implementarlas, definir cantidad mínima de evaluaciones, explicación visible, derecho de réplica, revisión admin, prevención de represalias y protección contra discriminación.

# 15. Notificaciones

- Notificaciones internas en tiempo real.
- Historial persistente; se pueden marcar como leídas, no eliminar.
- Contador de no leídas opcional.
- Posibles categorías y preferencias configurables.
- Al abrir una notificación, navegar directamente a chat, publicación, perfil o contratación correspondiente.
- Canales email/WhatsApp/push se definirán luego; consentimiento explícito requerido para WhatsApp.
- Errores de entrega se registran como error.
- Recordatorios de citas, vencimiento de suscripción y pagos fallidos sí se contemplan.
- Recordatorios antes del fin de prueba/plan.
- Notificaciones de disponibilidad para Medium/Premium y perfiles seleccionados.
- Admin puede enviar novedades a todos, a usuarios individuales o a segmentos por rol, profesión y plan; se reflejan en dashboard y email según configuración.
- No asumir que todas las notificaciones externas son obligatorias ni que existe consentimiento automático.

# 16. Chatbot y agenda Premium

- Solo Premium.
- Chatbot se habilita en el mismo chat luego del primer mensaje del cliente.
- Responde preguntas frecuentes y consultas sobre servicios con el contexto que el profesional proporciona.
- Profesional puede configurar contexto y respuestas predefinidas.
- Está activo 24 horas, pero el profesional puede desactivarlo.
- Consulta estado y horarios del profesional.
- No propone horarios por sí solo, no envía presupuestos y no negocia precios.
- Puede confirmar cita sin aprobación manual únicamente si el profesional lo autoriza.
- Cliente puede cancelar/modificar cita.
- El chatbot se identifica claramente como automatizado.
- Límites e instrucciones de comportamiento definidos por profesional; si no sabe responder, comunica: “En este momento no puedo responder a tu consulta”.
- Profesional puede revisar conversaciones atendidas por chatbot.
- Deriva al profesional dentro del mismo chat.
- Avisos de cita y mensajes pueden comunicarse por WhatsApp/email; reglas y consentimiento deben definirse.
- Si profesional pierde Premium, debe pagar para mantener funciones; si no, perfil se oculta. Citas previamente acordadas deben respetarse según el acuerdo entre las partes, pero el acceso operativo durante impago está en tensión con el bloqueo de plataforma y debe definirse.
- Si cambia horarios luego de una cita confirmada, la cita existente conserva el horario acordado; futuras citas deben adaptarse a nuevos horarios.

# 17. Dashboard del cliente

Secciones/funciones:
- Datos personales y edición de perfil.
- Administración de ubicación y permisos.
- Preferencias de notificaciones.
- Solicitudes, con filtros como activas, leídas, resueltas/cerradas.
- Conversaciones recientes (retención de un mes según regla actual).
- Favoritos.
- Notificaciones.
- Reseñas pendientes.
- Profesionales seguidos y notificaciones de disponibilidad.
- Acceso a historial/recontratación desde profesionales visitados/contratados; favoritos pueden ayudar a volver a encontrarlos.
- Reportes a soporte.
- Clasificación propia y solicitud de revisión.

# 18. Dashboard del profesional

Secciones/funciones:
- Estado de atención actual y administración de disponibilidad/horarios.
- Plan contratado, vencimiento, contador de prueba, historial de suscripciones/pagos.
- Edición de perfil, contenido visual, certificados, profesiones y zonas.
- Chats recientes y solicitudes.
- Reseñas recibidas y respuestas.
- Notificaciones y preferencias.
- Métricas según plan; Premium incluye analítica de perfil.
- Configuración de chatbot/agenda si Premium.
- Reportes al soporte.
- Gestión de anuncios/novedades recibidos.
- Si plan vencido: pantalla de elección de plan y acceso restringido; no borrar datos.

# 19. Panel de administración

El admin necesita una vista integral de:
- Total de clientes y profesionales.
- Profesionales por plan.
- Suscripciones activas, vencidas, pendientes de pago.
- Nuevas cuentas, publicaciones y reportes.
- Usuarios sancionados.
- Estadísticas generales.
- Búsqueda por nombre, email, rol y estado.
- Perfil completo de cliente/profesional.
- Verificaciones y certificados pendientes.
- Cambios manuales de plan por acuerdo.
- Mensajes individuales y anuncios/novedades.
- Moderación de publicaciones, comentarios, perfiles, medios y reseñas.
- Eliminación/restauración de cuentas.
- Reportes y conversaciones vinculadas a denuncias.
- Historial de pagos por profesional, cambios de plan, cuentas eliminadas, contenido, reseñas y acciones relevantes.
- Acciones con confirmación: eliminar cuentas, ocultar comentarios y otras operaciones críticas.
- No se planean otros administradores al inicio.

# 20. Reportes, strikes y sanciones

## 20.1 Reportes
- Reportes bidireccionales entre cliente y profesional.
- Se pueden reportar perfiles, mensajes, publicaciones, comentarios y reseñas; no contrataciones como entidad reportable según la respuesta.
- Motivos preliminares: discriminación, falta de respeto, tardanza/no presentación, servicio no acorde a lo acordado/pago, fraude, amenazas, contenido ofensivo, spam y otros. La lista final debe construirse con el fundador.
- Explicación libre y adjuntos/evidencia.
- Feedback visual moderno al enviar.
- Estados: enviado, en revisión, revisado.
- El denunciado recibe aviso; identidad del denunciante se mantiene privada.
- Admin determina validez.
- Reporte rechazado no genera strike al denunciante.
- Usuario puede apelar/defenderse.

## 20.2 Strikes y sanciones
- Aplican a clientes y profesionales; el peso para profesionales puede ser mayor según el fundador.
- Señales iniciales sugeridas por el fundador: 3 reportes, 5 calificaciones negativas seguidas, más de 4 reseñas negativas y otros parámetros.
- Strikes con distinto peso según gravedad.
- Se indicó que pueden asignarse automáticamente, pero la validez del reporte la decide admin. **Diseñar como reglas de detección/alerta automática y validación administrativa para no sancionar automáticamente reportes falsos**, salvo casos de seguridad extrema definidos expresamente.
- No vencen hasta que el admin los revise, según respuesta.
- Historial de strikes se conserva.
- Suspensión al llegar a 5 strikes; duración depende de gravedad.
- Durante suspensión no accede a la cuenta, chats, contrataciones ni puede finalizar trabajos.
- Baneo permanente al llegar a cinco strikes según otra respuesta; el umbral exacto es inconsistente (5 strikes equivale a suspensión y también a perma-ban). Resolver.
- Reincorporación tras baneo puede requerir multa de $8.000 ARS y autorización exclusiva del admin.
- Fraude o amenazas pueden provocar baneo permanente sin posibilidad de pagar multa para volver.
- Se prohíbe crear cuenta nueva tras sanción; detección, proceso de apelación y tratamiento de falsos positivos pendientes.
- La multa y la política de sanciones requieren revisión legal antes de activar.

# 21. Soporte, contacto y novedades

- Email y teléfono oficiales aún no creados; no inventarlos.
- Formulario de contacto: recomendación, falla, incidencia, reclamo, reporte.
- Se pueden adjuntar evidencias; en soporte general se indicó una foto.
- Respuesta por plataforma y email del usuario.
- No se asigna número de seguimiento.
- Tiempo comunicado: 48–72 horas hábiles.
- Admin responde.
- Novedades con imágenes/enlaces; envío individual, masivo o segmentado por profesión/plan/rol.
- Los reportes técnicos y sugerencias deben poder enviarse desde dashboard.

# 22. Ciclos de vida y casos end-to-end

## 22.1 Visitante → cliente
Landing → catálogo → detalle → CTA de interacción → registro → datos obligatorios → verificación → cuenta habilitada → iniciar chat/solicitud → dashboard.

Si verificación está pendiente o falla: mostrar estado y explicación; no permitir operar. El método de revisión y los estados exactos están pendientes.

## 22.2 Visitante → profesional
Landing → CTA “Sumarme como profesional” → registro y oficio → verificación → completar perfil → prueba 30 días → dashboard con contador → catálogo muestra perfil activo → al finalizar prueba se solicita plan → pago confirmado → suscripción activa y acceso según plan.

Si no paga: ocultar perfil, preservar datos, mostrar pantalla de planes. Si pago falla: incidencia para soporte y estado de pago pendiente/error.

## 22.3 Cliente encuentra y contrata
Catálogo/filtros → detalle profesional → CTA chat/solicitud → conversación → intercambio de información y medios → presupuesto/acuerdo → cliente elige profesional → coordinación de fecha/domicilio → servicio → profesional marca finalizado → cliente puede reseñar/reportar → historial.

La plataforma no cobra ni define el importe. El acuerdo ocurre entre las partes.

## 22.4 Cliente solicita a varios
Cliente inicia solicitudes/chats con varios profesionales → cada uno responde por su canal → cliente compara y decide → selecciona uno → notificación informativa a los demás → la contratación queda vinculada al profesional elegido. Definir si las otras solicitudes se cierran, se mantienen abiertas o quedan como no seleccionadas.

## 22.5 Foro
Visitante lee → login para interactuar → crear Consulta o Solicito Profesional → respuestas anidadas/reacciones → autor marca resuelta → se bloquean nuevos comentarios → contenido permanece visible. Reporte → revisión admin → ocultar/eliminar según resolución.

## 22.6 Cancelación y reporte
Cliente/profesional cancela → justificación opcional → notificación a contraparte → historial básico → si hay incumplimiento, reporte con evidencia → admin revisa → resolución/strike/sanción cuando corresponda → apelación disponible. Las partes pueden seguir comunicándose salvo bloqueo/suspensión o regla legal definida.

## 22.7 Impago/suscripción vencida
Avisos previos → vencimiento → perfil público oculto → funcionalidades profesionales bloqueadas → historial conservado → foro solo lectura → dashboard muestra “Elegí un plan para continuar” → pago/reactivación → reestablecer contenido y acceso conforme al plan.

## 22.8 Cuenta suspendida o baneada
Reporte/alerta → revisión → decisión admin → aviso y motivo permitido → suspensión/baneo según gravedad → usuario no accede durante suspensión → apelación → decisión admin → eventual reincorporación según política. Fraude/amenaza grave puede ser permanente sin multa de recuperación.

# 23. Datos, eventos y métricas de negocio

El admin necesita poder revisar:
- Registros por rol, fecha y zona.
- Conversión visitante → registro → verificación → perfil completo → profesional con plan pago.
- Profesionales activos por plan y suscripciones vencidas.
- Vistas de perfiles por día/semana/mes, distinguiendo visitantes autenticados/no autenticados cuando sea legal y técnicamente viable.
- Búsquedas y filtros utilizados.
- Solicitudes iniciadas, profesionales contactados, ofertas recibidas y profesional seleccionado.
- Contrataciones aceptadas, finalizadas, canceladas y reportadas.
- Reseñas, promedio, distribución y cantidad.
- Uso del foro, publicaciones resueltas, interacciones.
- Notificaciones entregadas/fallidas.
- Reportes, strikes, apelaciones y tiempos de resolución.
- Ingresos de suscripciones y costos operativos.

El fundador quiere que el admin pueda consultar el detalle de clientes/profesionales y los datos que permitan medir si reciben solicitudes y completan trabajos. Definir privacidad, minimización y métricas exactas antes de instrumentar.

# 24. Lanzamiento y crecimiento

- Lanzamiento inicial en Córdoba Capital.
- Cobertura: todos los barrios/zonas que puedan atender los profesionales; la disponibilidad real depende de zona declarada y ubicación del cliente.
- El fundador desea incluir todos los oficios y permitir que cualquier profesional se registre.
- Captación inicial mediante contactos/conocidos y publicidad en Facebook y otros canales.
- Todas las funcionalidades mencionadas se desean para el lanzamiento; el fundador no indicó recorte de MVP. Esto no elimina la necesidad de planificar fases técnicas.
- Foro y chat en tiempo real desde lanzamiento.
- Planes pagos activos desde inicio.
- Prueba gratuita para captar profesionales.
- Medición de registros, contrataciones, solicitudes por profesional y trabajos completados; el mecanismo aún debe definirse.
- Expansión a otras ciudades cuando haya al menos 80 profesionales registrados y 40 o más clientes, según criterio inicial del fundador.
- Se solicitará feedback sobre facilidad de uso, completitud de perfiles, diseño y motivación de profesionales.

# 25. Seguridad, privacidad y revisión legal

El fundador explícitamente indicó que **no quiere que se inventen respuestas legales**: toda la sección de seguridad/privacidad debe tratarse luego de una asesoría real de un abogado calificado.

Por lo tanto:
- No redactar términos y condiciones definitivos.
- No asumir consentimientos, bases legales, plazos de retención, tratamiento de DNI/biometría, ubicación, chats o datos de clientes.
- No implementar multas, intereses, reconocimiento facial, cobro automático, descarga de datos personales o retención/borrado definitivo sin decisiones y validación.
- Dejar estos puntos como bloqueadores de lanzamiento cuando corresponda.
- El sistema debe ser diseñado con controles de acceso, autorización en backend, minimización de datos, registro de acciones críticas y manejo seguro de archivos, pero la política concreta debe ser validada por especialistas.
- Mostrar avisos de seguridad apropiados, sin afirmar garantías que la plataforma no pueda ofrecer.
- Los números y reglas comerciales del cuestionario no reemplazan la revisión legal.

# 26. Flujos críticos y estados sugeridos

## Suscripción
Estados candidatos: `TRIAL`, `ACTIVE`, `CANCEL_AT_PERIOD_END`, `PAST_DUE`, `EXPIRED`, `PAYMENT_PENDING`, `PAYMENT_FAILED`, `SUSPENDED_BY_ADMIN`. No son nombres obligatorios; validar la máquina de estados y reglas de acceso.

## Verificación
Estados candidatos: `NOT_STARTED`, `PENDING`, `APPROVED`, `REJECTED`, `REQUIRES_REVIEW`. No permitir acceso operativo antes de aprobar.

## Reporte
Estados candidatos: `SUBMITTED`, `UNDER_REVIEW`, `REVIEWED`, `REJECTED`, `ACTION_TAKEN`, `APPEALED`. Confirmar estados finales y quién puede ver cada uno.

## Acceso por rol
Toda autorización debe derivarse de:
- Usuario autenticado.
- Rol activo.
- Estado de verificación.
- Estado de cuenta/sanción.
- Para profesional: estado de suscripción, plan y límites.
- Relación de pertenencia al recurso (chat, solicitud, reseña, publicación).
- Permisos administrativos explícitos.

# 27. Riesgos, contradicciones y decisiones pendientes

No resolver silenciosamente estos puntos:

1. **Marca:** Repara Ya vs Nexo Pro; confirmar marca y nombre legal.
2. **Prueba y cliente:** el cuestionario dice que el cliente usa la plataforma gratis el primer mes y también que no puede usar Nexo Pro sin pagar; precisar si el pago es solo para profesionales o también aplica a clientes.
3. **Cobro automático:** el fundador quiere no pedir tarjeta antes de la prueba, pero también menciona cobro automático tras 30 días. Aclarar consentimiento, método de pago y cómo evitar cargos no autorizados.
4. **Pérdida de prueba por no actualizar perfil:** definir evento/condición exacta.
5. **Cambio de plan:** precisar si “diferencia” se prorratea, cómo se calculan los primeros 10 días, y qué pasa si pago está pendiente/falla.
6. **Interés del 3 %:** base de cálculo, periodicidad, legalidad y fecha de inicio.
7. **Disponibilidad:** regla de cambio manual/automático y efecto de solicitud aceptada/contratación activa entran en tensión.
8. **Contratación:** estados, transiciones, quién puede modificar, aceptación del presupuesto, cancelaciones y cierre de solicitudes múltiples.
9. **Finalización:** profesional marca completado sin confirmación; definir plazo de reseña, apelación y prueba de servicio.
10. **Chat:** retención de un mes vs acceso admin para reportes; definir borrado y preservación de evidencia.
11. **Datos de cliente:** perfil visible al profesional, descarga/almacenamiento y dirección exacta requieren política de acceso.
12. **Clasificación de clientes:** mínimo de evaluaciones, cálculo, transparencia, apelación y prevención de discriminación.
13. **Ranking:** peso de plan, rating, visitas, trabajos, ubicación y disponibilidad; evitar pay-to-win oculto y definir rotación.
14. **Strikes:** cuestionario menciona 5 strikes como suspensión temporal y también como baneo permanente; resolver umbrales y sanciones.
15. **Strikes automáticos:** reportes no validados no deben producir sanción definitiva; definir automatización como señal/alerta y revisión humana.
16. **Multa de $8.000:** aplicabilidad, pago, reintegro, apelación y legalidad.
17. **Cuentas duplicadas:** reglas para similitud y proceso de revisión de falsos positivos.
18. **Verificación:** proveedor, documentos, biometría, manual review, tratamiento y eliminación.
19. **Contenido excedente al bajar/expirar plan:** confirmar si se oculta, bloquea, conserva y en qué orden.
20. **Premium y citas:** qué pasa con citas agendadas cuando el plan expira.
21. **Notificaciones externas:** canales, consentimientos, horarios silenciosos y fallos.
22. **Soporte:** correo/teléfono oficiales aún no definidos.
23. **Lanzamiento completo:** el deseo de lanzar “todo” puede requerir varias fases; la planificación técnica no debe eliminar alcance.
24. **Privacidad/legal:** revisión completa por abogado antes de publicar políticas o activar datos sensibles.

# 28. Fases de implementación sugeridas (plan técnico, no recorte del alcance)

El fundador desea el producto completo; estas fases son una estrategia para construir, probar y desplegar con menos riesgo, no una reducción de visión.

- **Fase 0 — Validación funcional:** resolver bloqueadores del apartado 27; confirmar marca, precios, estados, planes y reglas de acceso.
- **Fase 1 — Fundamentos:** autenticación, roles, verificación, perfil, catálogo, filtros, permisos backend, almacenamiento de medios y diseño responsive.
- **Fase 2 — Suscripciones:** prueba de 30 días, Mercado Pago, planes/límites, vencimiento, cancelación, upgrades, historial y webhooks idempotentes.
- **Fase 3 — Comunicación y contratación:** chat, solicitudes, estados, notificaciones internas, archivos, cancelaciones y reportes.
- **Fase 4 — Comunidad y reputación:** foro, comentarios anidados, reacciones, reseñas, respuestas y reportes.
- **Fase 5 — Dashboards y administración:** cliente/profesional/admin, moderación, verificación, métricas, auditoría y soporte.
- **Fase 6 — Premium:** chatbot, agenda, analytics, contenido especial, avisos de disponibilidad y personalización.
- **Fase 7 — Hardening y lanzamiento:** seguridad, accesibilidad, pruebas, observabilidad, políticas legales, backups, monitoreo y pruebas de aceptación.

Claude Code debe proponer dependencias, criterios de aceptación y pruebas por fase. No comenzar funciones sensibles antes de que sus decisiones estén cerradas.

# 29. Contexto funcional previo completo

A continuación se conserva el documento previo de “flujo de la app” como material de contexto, para que no se pierdan los detalles originales de la idea. Las reglas del cuestionario respondido se desarrollan y organizan en las secciones anteriores. Si existe una diferencia, marcarla como contradicción para que el fundador decida; no eliminar ninguno de los dos aportes.

---

# REPARA YA / NEXO PRO
## Documento de contexto funcional y alcance inicial para Claude Code

> **Propósito de este documento**
>
> Este documento reúne y reorganiza la idea funcional compartida por el fundador de Repara Ya / Nexo Pro. Debe servir como contexto de producto para Claude Code antes de comenzar a implementar funcionalidades.
>
> **Instrucción importante:** conservar todos los apartados, capacidades, reglas, ejemplos y criterios expresados aquí. No eliminar requisitos ni dar por cerradas decisiones que todavía requieren definición. Si detectás contradicciones, riesgos de seguridad, complejidad técnica o decisiones incompletas, señalalos y proponé alternativas, pero no las resuelvas silenciosamente ni cambies el alcance por tu cuenta.
>
> Este documento describe el alcance funcional imaginado “de la A a la Z” según la información disponible. No reemplaza una especificación técnica, una revisión legal ni una validación de negocio.

---

# 1. Visión general del producto

**Repara Ya / Nexo Pro** será una plataforma que conecte a personas que necesitan resolver problemas o contratar servicios con profesionales y trabajadores de distintos oficios.

La plataforma debe permitir que los usuarios conozcan a los profesionales, revisen sus perfiles, se comuniquen mediante herramientas internas, soliciten servicios y gestionen su experiencia desde una cuenta personal. Los profesionales podrán mostrar sus habilidades, recibir solicitudes, administrar su perfil y utilizar funcionalidades que dependerán de su suscripción mensual.

El producto contempla tres roles principales:

- **Cliente:** persona que necesita consultar, encontrar o contratar un servicio.
- **Profesional:** persona que ofrece servicios u oficios.
- **Administrador:** fundador y responsable de gestionar y moderar la plataforma.

Los nombres **Repara Ya** y **Nexo Pro** aparecen como alternativas de marca en la idea original. La marca definitiva deberá confirmarse.

## 1.1. Orientación de diseño y dispositivos

- Enfoque **mobile-first**.
- Diseño **responsive**, adaptable también a escritorio.
- La experiencia debe considerar tanto a usuarios no registrados como a usuarios registrados.
- Las funcionalidades disponibles y la información visible variarán según el rol, el estado de autenticación y, en el caso de los profesionales, el plan contratado.

---

# 2. Navegación para usuarios no registrados

Los usuarios que todavía no tengan una cuenta podrán explorar la plataforma y conocer sus principales propuestas. No podrán solicitar formalmente un servicio ni participar activamente en las interacciones reservadas a usuarios registrados.

La navegación pública contempla las siguientes secciones.

## 2.1. Inicio

La página de inicio debe explicar:

- Quiénes somos.
- Qué problema buscamos solucionar.
- Cómo se utiliza Repara Ya / Nexo Pro.
- Los planes disponibles: **Basic, Medium y Premium**, y qué incluye cada uno.
- Información de seguridad para clientes y profesionales.
- Preguntas frecuentes.
- Una opción para reportar una incidencia.

La sección de planes debe explicar las propuestas destinadas a los profesionales y sus diferencias.

## 2.2. Profesionales: catálogo público

Se ofrecerá un catálogo de personas que brindan servicios profesionales y oficios.

### Filtros del catálogo

El catálogo debe permitir filtrar por:

- Profesión u oficio.
- Disponibilidad inmediata (“disponibles ya”).
- Cercanía al usuario, con posibilidad de definir un rango de kilómetros.
- Mejor valoración, según estrellas o puntuaciones.
- Mayor cantidad de trabajos realizados.
- Estado de verificación: verificados o no verificados.

### Perfil/detalle de cada profesional

Cada profesional tendrá una página o detalle personalizado. Los botones principales, independientemente del plan, serán:

- **“Chatear”**: abre una funcionalidad de chat en tiempo real para que profesionales y usuarios registrados conversen sobre situaciones, precios y gestiones relacionadas con el servicio.
- **“Solicitar Servicio”**: permite iniciar una solicitud. Para utilizarla, la persona debe estar registrada y haber iniciado sesión.

La información y las funciones del perfil cambiarán según el plan mensual abonado por el profesional.

### Plan Basic — $10.000 mensuales

El perfil Basic podrá mostrar:

- Nombre y apellido.
- Foto de perfil.
- Número de teléfono.
- Email.
- Profesión u oficio.
- Descripción personalizada sobre la persona y su rubro.
- Dos fotografías del profesional.
- Hasta tres fotografías que muestren sus trabajos o servicios.
- Puntuaciones y reseñas recibidas.
- Cantidad de trabajos realizados.
- Horarios de disponibilidad laboral (por ejemplo, de 08:00 a 18:00).
- Estado del profesional en tiempo real:
  - Disponible.
  - Trabajando / en servicio.
  - Descansando.
- Información sobre movilidad: sí o no.
- Certificados de cursos o carreras que respalden sus habilidades en su profesión o rubro.

### Plan Medium — $15.000 mensuales

Incluye todo lo del plan Basic y, además:

- Posibilidad de aparecer entre los primeros resultados del catálogo, con un marco plateado o distintivo y mejor posicionamiento dentro de la página.
- Posibilidad de agregar **una profesión adicional**. Por ejemplo, aparecer en búsquedas como fontanero y carpintero, u otras combinaciones.
- Posibilidad de agregar un video de presentación o de realización de un trabajo, para generar confianza.
- Personalización visual del detalle profesional:
  - Cambiar colores.
  - Usar gradientes de un color a otro.
  - Agregar una imagen al banner.
  - Cambiar colores de otras secciones.
  - Otras opciones de personalización visual relacionadas.

También se contempla que los usuarios puedan recibir notificaciones cuando un profesional cambie su estado a disponible. El mensaje genérico propuesto sería similar a:

> “[Nombre], de profesión [profesión/oficio], está disponible hasta las [hora límite a la que trabaja]”.

La recepción de estas notificaciones debe contemplar la autorización del usuario.

### Plan Premium — $20.000 mensuales

Incluye todo lo comprendido en Basic y Medium, más:

- Posibilidad de subir hasta **tres videos**, por ejemplo:
  - Video de presentación.
  - Video mostrando un trabajo.
  - Video con un cliente satisfecho.
- Posibilidad de enviar notificaciones personalizadas, por ejemplo, un eslogan o mensaje que atraiga más clientes, en lugar de la notificación genérica contemplada para Medium.
- Estadísticas y métricas de la cuenta, entre ellas:
  - Cantidad de personas que ven el perfil.
  - Cantidad de veces que apareció primero en las búsquedas.
  - Puntuaciones.
  - Trabajos solicitados.
  - Trabajos completados.
  - Métricas correspondientes a día, semana y mes.
- Posibilidad de aparecer en una ventana modal o emergente con la etiqueta **“Recomendado”**.
- Posibilidad de tener hasta **tres profesiones** en el perfil (por ejemplo, carpintero, cerrajero y pintor, u otras combinaciones).
- Un video especial para el catálogo: el profesional aparecerá caminando hacia adelante desde un lugar oscuro, se detendrá, cruzará los brazos y sonreirá, con una puesta en escena inspirada en la entrada de un jugador a la cancha. Este video estará visible en el catálogo de profesionales.
- Un **chatbot** que pueda responder consultas en nombre del profesional mientras duerme y agendar citas por sí mismo.
- Cuando el chatbot agende una cita, la notificación deberá llegar tanto al WhatsApp como al correo electrónico del profesional. El ejemplo de mensaje es:

> “Tienes una cita programada para [fecha] [lugar] [hora] con el cliente [cliente] para tus servicios de [fontanería]. El problema: [se le rompió el caño de la bacha y pierde agua por la cocina]”.

### Acceso público y restricciones de contratación

Los usuarios registrados y no registrados podrán ver la información pública del perfil profesional, con las diferencias correspondientes al plan contratado.

Sin embargo, **solo un usuario registrado y autenticado podrá solicitar un servicio**.

La razón principal expresada para esta restricción es la seguridad de ambas partes. La plataforma busca cuidar tanto a los clientes como a los profesionales. Se plantea que ambos deberán estar registrados y verificados para evitar situaciones en las que una persona desconocida o malintencionada convoque a un profesional, lo robe, obtenga información de forma indebida o genere otros incidentes no deseados.

> La verificación concreta de clientes y profesionales, los datos requeridos y los mecanismos de protección todavía deben especificarse. No asumir una solución técnica o legal sin validarla.

## 2.3. Foro general

Habrá un foro donde los usuarios registrados podrán publicar problemas y seleccionar el motivo de la publicación. Se plantean dos tipos o estados principales.

### A. “Consulta”

La persona publica una consulta para recibir recomendaciones de la comunidad profesional.

Ejemplo:

Una clienta llamada Verónica escribe en un área de texto y adjunta dos fotografías:

> “Mi grifo de la cocina pierde agua desde la base. ¿Qué puede estar causándolo y cómo lo arreglo?”

Los profesionales de distintas áreas podrán:

- Recomendar posibles soluciones.
- Ayudar a determinar cuál podría ser el problema.
- Guiar a la persona para solucionar la situación.

### B. “Solicito Profesional”

La publicación indica que la persona necesita contratar a alguien de un área determinada.

- El usuario tendrá un selector para elegir las profesiones que considere capaces de resolver su problema.
- Los profesionales podrán responder indicando que están disponibles para el trabajo.
- Podrán explicar que se desempeñan en esa área y proponer cuánto cobrarían por resolver el problema.
- El precio y las condiciones se conversarán libremente entre cliente y profesional.

### Respuestas y visualización del foro

- Tanto clientes como profesionales podrán responder las publicaciones.
- Las respuestas podrán desplegarse mediante un dropdown después de la primera respuesta, para evitar que los hilos sean demasiado largos. La referencia de interacción es similar a Instagram o Facebook.
- Solo clientes y profesionales registrados podrán publicar o interactuar.
- Los usuarios no registrados podrán leer las publicaciones y sus intercambios para familiarizarse con el funcionamiento de la plataforma.

## 2.4. Contacto

La sección de contacto debe incluir:

- Email de la empresa.
- Área de texto para enviar mensajes.
- Posibilidad de reportar errores, compartir ideas o realizar comentarios.
- Número de teléfono de la empresa.

Los datos concretos de contacto deberán ser proporcionados por el fundador.

## 2.5. Términos y condiciones

Debe existir una sección legal visible y accesible para el usuario.

La idea original propone incluir información como:

- La plataforma no se hará cargo de pérdidas de dinero.
- La plataforma no se hará cargo de robos.
- La plataforma no se hará cargo de encuentros no gratificantes entre las partes involucradas (cliente y profesional).
- Información legal y otras aclaraciones pertinentes para reducir riesgos y problemas para el CEO y fundador de Repara Ya / Nexo Pro.

El fundador indicó que consultará a un abogado real para obtener una lista de disposiciones y revisar esta sección. **No redactar ni presentar estas exenciones como legalmente válidas sin revisión profesional.**

## 2.6. Registro e inicio de sesión

El formulario de registro/login debe permitir identificar si la persona se registra como:

- Profesional.
- Cliente.

Se plantea un selector (por ejemplo, “¿Sos profesional o cliente?”) y una opción tipo checkbox para elegir el rol.

Si se selecciona **Profesional**, se abrirá un formulario pequeño adicional para indicar la profesión u oficio que realiza.

También se contempla la posibilidad de iniciar sesión o registrarse con Google.

---

# 3. Funcionalidades para usuarios registrados

Los usuarios registrados podrán acceder a todo lo que ve un usuario no registrado, además de un dashboard personal y funcionalidades según su rol.

# 4. Rol Cliente

## 4.1. Dashboard y gestión de cuenta

El cliente tendrá un dashboard personal desde el cual podrá gestionar:

- Sus propios datos.
- Notificaciones.
- Ubicación en tiempo real.
- Favoritos.
- Reseñas realizadas.
- Puntuaciones otorgadas a profesionales, asociadas a cada profesional correspondiente.

## 4.2. Perfil del cliente visible para profesionales

El cliente tendrá un perfil/detalle que podrán consultar los profesionales, con un propósito de seguridad: que el profesional pueda conocer a la persona y tener una referencia de dónde podría acudir para resolver el problema.

El perfil del cliente podrá mostrar:

- Nombre.
- Apellido.
- Foto de perfil.
- Número de teléfono.
- Email.
- Localidad, barrio y otros campos que el cliente podrá agregar desde su dashboard y que puedan servirle al profesional.

El profesional también podrá ver un estado o clasificación del perfil del cliente:

- Exigente.
- Normal.
- Fácil de complacer.

La idea original indica que estos parámetros se determinarían según las calificaciones que el usuario dé a cada profesional. **La lógica exacta de esta clasificación, su transparencia, sus efectos y sus resguardos deben definirse antes de implementarla**, ya que puede afectar la reputación y privacidad de las personas.

## 4.3. Notificaciones

- Los clientes podrán recibir notificaciones de profesionales, siempre que el cliente haya dado autorización.
- Las preferencias de notificación deberán poder gestionarse desde la cuenta.

## 4.4. Solicitud y contratación de servicios

El cliente podrá solicitar un profesional:

- Desde el detalle del profesional.
- Desde el catálogo de profesionales.

Estas acciones estarán habilitadas para usuarios registrados y autenticados.

## 4.5. Foro

El cliente podrá publicar en el foro general para:

- Realizar una consulta.
- Solicitar un profesional.

## 4.6. Calificaciones y reseñas

- El cliente podrá puntuar a un profesional con estrellas del **1 al 5**.
- Podrá dejar una reseña únicamente después de que el profesional haya realizado el trabajo solicitado.
- La reseña se habilitará cuando el profesional marque el trabajo como **“Finalizado”**.
- El cliente podrá consultar y gestionar las reseñas y puntuaciones que haya realizado.

## 4.7. Favoritos, recomendaciones y compartir

El cliente podrá:

- Guardar como favorito a un profesional que haya contratado y que le haya resultado útil, o al que considere volver a contratar.
- Recomendar a un profesional.
- Copiar la URL del perfil profesional y compartirla.

## 4.8. Reportes e incidencias

El cliente podrá:

- Reportar una incidencia al equipo de soporte.
- Reportar a un profesional por un conflicto, acompañado de un mensaje que explique el problema.

Ejemplos de motivos mencionados:

- No solucionó el problema.
- Fue irrespetuoso.
- Cobró demasiado caro.
- Otros conflictos.

## 4.9. Opiniones sobre la plataforma

Los clientes podrán dejar reseñas u opiniones sobre Repara Ya / Nexo Pro como página o aplicación.

---

# 5. Rol Profesional

## 5.1. Interacción con el foro

El profesional podrá responder las publicaciones realizadas por usuarios en el foro.

## 5.2. Consulta de perfiles de clientes

Los profesionales podrán indagar o consultar los perfiles de los usuarios **solamente cuando un usuario les solicite un servicio**, según la regla expresada en la idea original.

## 5.3. Dashboard profesional

El profesional tendrá un dashboard desde el cual podrá:

- Editar su detalle o perfil profesional.
- Publicar fotografías.
- Modificar descripciones.
- Cambiar colores y personalización visual.
- Subir videos.
- Modificar datos.
- Especificar profesiones u oficios.
- Gestionar otras opciones del perfil, según el nivel de suscripción mensual que abone.

La disponibilidad de estas herramientas dependerá del plan Basic, Medium o Premium descrito anteriormente.

## 5.4. Notificaciones para profesionales

El profesional podrá recibir notificaciones cuando:

- Se publique algo en el foro.
- Alguien responda directamente a una respuesta suya en el foro.
- Un cliente solicite sus servicios.

Ejemplo de notificación:

> “Estefanía necesita a un carpintero”.

Al abrir esa notificación, se mostrarán dos botones:

- **“Ir al Chat”**.
- **“Ver Cliente”**.

## 5.5. Estado de atención

El profesional podrá cambiar su estado de atención a:

- Disponible.
- Trabajando.
- Descansando.

## 5.6. Preferencias de notificaciones

El profesional contará con diferentes niveles u opciones de personalización de las notificaciones.

## 5.7. Chatbot profesional

El profesional podrá habilitar un chatbot. La idea es que cada profesional pueda personalizarlo de acuerdo con:

- Sus horarios.
- Su zona.
- Su profesión.
- Otros parámetros relevantes.

En el plan Premium se plantea que el chatbot pueda responder consultas mientras el profesional duerme y agendar citas por sí mismo, con avisos por WhatsApp y email. La configuración, los permisos, los límites de actuación y la integración necesaria deberán detallarse antes de desarrollar esta función.

## 5.8. Reportes al equipo de soporte

El profesional podrá enviar reportes para:

- Quejarse de un cliente.
- Informar una incidencia en la plataforma.
- Recomendar ideas.
- Comunicar otros asuntos al equipo de soporte.

## 5.9. Redes sociales y compartir perfil

El profesional podrá:

- Adjuntar sus redes sociales, si lo desea.
- Compartir su perfil profesional.
- Copiar la URL de su página de detalle.

## 5.10. Opiniones sobre la plataforma

Los profesionales podrán dejar reseñas u opiniones sobre Repara Ya / Nexo Pro como página o aplicación.

---

# 6. Rol Administrador

El administrador será el fundador y responsable de gestionar la plataforma.

## 6.1. Moderación y gestión de publicaciones

El administrador podrá:

- Gestionar publicaciones de profesionales y usuarios.
- Ocultar publicaciones ofensivas.
- Penalizar usuarios o profesionales ocultando sus perfiles.
- Publicar anuncios, noticias y novedades.

## 6.2. Novedades de Repara Ya / Nexo Pro

El administrador podrá publicar novedades que llegarán a los dashboards de clientes y profesionales, dentro de una sección llamada:

**“Novedades de Repara Ya / Nexo Pro”**.

## 6.3. Gestión de cuentas y roles

El administrador podrá:

- Eliminar cuentas.
- Dar de alta a clientes para que tengan el rol de usuario.
- Consultar el detalle de profesionales y clientes.
- Enviar mensajes personales en nombre de la empresa.
- Emitir avisos.

## 6.4. Gestión de planes

El administrador podrá cambiar los planes de los profesionales en distintos momentos, por ejemplo, pasar de un plan mensual A a un plan B.

## 6.5. Notificaciones y actividad de la plataforma

El administrador recibirá notificaciones sobre:

- Todas las personas que se registren en la aplicación, tanto profesionales como clientes.
- Las publicaciones que se realicen.

## 6.6. Sistema de strikes y sanciones

Se plantea un sistema de strikes para comportamientos indebidos o incidencias:

- **3 incidencias o malos comportamientos:** la cuenta será baneada y ocultada durante un período determinado.
- **5 strikes:** baneo permanente.
- Para volver a incorporar esa cuenta después de llegar a cinco strikes, la persona deberá abonar una multa de **$8.000**.

La duración de las sanciones temporales, el procedimiento de revisión, el alcance del baneo, la aplicación de la multa y las condiciones de reincorporación deben definirse expresamente. No implementar sanciones automáticas irreversibles ni cobros sin una política aprobada y revisada.

---

# 7. Planes y monetización expresados en la idea

Los planes mensuales de profesionales mencionados son:

| Plan | Precio mensual propuesto |
|---|---:|
| Basic | $10.000 |
| Medium | $15.000 |
| Premium | $20.000 |

Los valores se incluyen tal como fueron indicados por el fundador y deben considerarse **precios propuestos**, no tarifas definitivas ni necesariamente actualizadas.

El alcance de cada plan está detallado en la sección de catálogo y perfiles profesionales. En términos generales:

- Basic: perfil profesional con datos, material fotográfico, reputación, disponibilidad, estado, movilidad y certificados.
- Medium: incluye Basic, mejor posicionamiento/distintivo, una profesión adicional, video y personalización visual, además de notificaciones de disponibilidad.
- Premium: incluye Basic y Medium, más videos adicionales, notificaciones personalizadas, métricas, etiqueta “Recomendado”, hasta tres profesiones, video especial para el catálogo y chatbot con agenda y avisos.

---

# 8. Consideraciones de seguridad, confianza y privacidad

La seguridad es un objetivo central expresado por el fundador. La plataforma busca proteger tanto a clientes como a profesionales.

Aspectos que deben mantenerse presentes durante el diseño:

- La solicitud de un servicio requiere registro e inicio de sesión.
- Se plantea que clientes y profesionales estén registrados y verificados.
- Los profesionales podrán consultar los perfiles de los clientes solo cuando el cliente solicite un servicio.
- Los clientes podrán autorizar o no las notificaciones de profesionales.
- Existirán mecanismos para reportar usuarios, profesionales, conflictos e incidencias.
- El administrador tendrá herramientas de moderación, ocultamiento de perfiles y sanciones.
- Los términos y condiciones deberán ser revisados por un abogado.

La idea menciona datos personales, ubicación en tiempo real, teléfono, email, fotos, perfiles, calificaciones, certificados y comunicaciones. Antes de implementar estas capacidades se deberán definir permisos, visibilidad, consentimiento, retención y medidas de protección adecuadas. Esta observación no elimina ninguno de los requisitos originales; busca que se desarrollen con reglas explícitas.

---

# 9. Alcance funcional resumido

La plataforma contempla, según la idea proporcionada:

1. Sitio público mobile-first y responsive.
2. Página de inicio informativa.
3. Catálogo de profesionales con filtros.
4. Perfiles profesionales con contenido y capacidades diferenciadas por plan.
5. Registro, login y acceso con Google.
6. Roles de cliente, profesional y administrador.
7. Chat en tiempo real.
8. Solicitudes de servicio.
9. Foro público de consultas y solicitudes de profesionales.
10. Dashboards para clientes y profesionales.
11. Gestión de perfiles, estados y disponibilidad.
12. Notificaciones y preferencias.
13. Calificaciones, reseñas, favoritos y recomendaciones.
14. Reportes, incidencias y soporte.
15. Herramientas de administración y moderación.
16. Novedades, anuncios y noticias.
17. Planes mensuales Basic, Medium y Premium.
18. Métricas profesionales en Premium.
19. Chatbot profesional y agenda automática en Premium.
20. Avisos de citas por WhatsApp y email.
21. Términos y condiciones y contenido legal revisado.
22. Sistema de strikes y sanciones.

Este resumen no sustituye las especificaciones detalladas de cada sección.

---

# 10. Guía de trabajo para Claude Code

Antes de comenzar a programar:

1. Leer este documento completo y tratarlo como la descripción de producto inicial.
2. No omitir funcionalidades, planes, roles, reglas, ejemplos ni apartados.
3. Separar claramente:
   - Requisitos expresamente indicados por el fundador.
   - Decisiones pendientes.
   - Riesgos o cuestiones que requieren validación.
   - Propuestas técnicas de Claude.
4. No inventar políticas de negocio, precios, permisos, sanciones, verificaciones o reglas de contratación.
5. Si una definición es necesaria para avanzar, preguntar o documentar una propuesta para aprobación.
6. Mantener una arquitectura que permita desarrollar el alcance por etapas sin perder de vista el producto completo.
7. No asumir que todas las funcionalidades deben construirse en el primer lanzamiento. Primero debe elaborarse una propuesta de etapas/MVP, identificando qué capacidades quedan para fases posteriores, pero sin borrar su presencia del alcance general.
8. Tener especial cuidado con la privacidad, seguridad, reputación de usuarios, geolocalización, comunicaciones, pagos y sanciones.
9. No presentar la sección legal como asesoramiento jurídico ni como garantía de exención de responsabilidad.
10. Antes de escribir código, entregar al fundador una revisión estructurada que incluya:
    - Resumen de comprensión del producto.
    - Roles y permisos.
    - Mapa de funcionalidades.
    - Flujos principales.
    - Reglas de negocio detectadas.
    - Decisiones pendientes y posibles contradicciones.
    - Riesgos relevantes.
    - Propuesta de implementación por etapas.

## 10.1. Tecnologías previstas

El fundador dispone de un documento técnico separado que especifica el orden de construcción y las restricciones de tecnología para:

- **Backend:** NestJS.
- **ORM:** TypeORM.
- **Base de datos:** PostgreSQL.
- **Frontend:** TypeScript.

El documento técnico separado deberá ser leído junto con este contexto antes de tomar decisiones de arquitectura o comenzar a implementar. No agregar ni cambiar tecnologías principales sin consultar al fundador.

---

# 11. Decisiones pendientes que deben conservarse como pendientes

La idea original no cierra todavía, entre otros, los siguientes puntos:

- Confirmación de la marca definitiva: Repara Ya o Nexo Pro.
- Definición precisa del proceso de verificación de clientes y profesionales.
- Alcance y reglas de la ubicación en tiempo real.
- Política de privacidad, visibilidad y tratamiento de datos personales.
- Reglas completas del chat y de las solicitudes de servicio.
- Flujo de estados de un trabajo, incluyendo cuándo se considera iniciado y finalizado.
- Reglas de cancelación, disputas y resolución de conflictos.
- Definición operativa de “disponible”, “trabajando/en servicio” y “descansando”.
- Reglas de ranking del catálogo y funcionamiento de los distintivos o etiquetas “Recomendado”.
- Detalles de las notificaciones, autorización y canales.
- Funcionamiento, límites y permisos del chatbot y la agenda.
- Integraciones necesarias para WhatsApp y correo electrónico.
- Criterios para las métricas del plan Premium.
- Definición de las clasificaciones de clientes “exigente”, “normal” y “fácil de complacer”.
- Política completa de strikes, duración de sanciones, apelaciones y multa.
- Condiciones de suscripción, cobro, renovación, cambios de plan y baja.
- Contenido final de términos y condiciones, revisado por un abogado.
- Datos oficiales de contacto de la empresa.
- Qué funcionalidades formarán parte del MVP y cuáles se desarrollarán después.

Estas cuestiones deben tratarse como pendientes, no como omisiones del documento. El objetivo es conservar la visión completa y avanzar con decisiones explícitas y aprobadas por el fundador.


---

# 30. Cuestionario respondido — fuente de trazabilidad

El archivo original de respuestas del fundador se incorpora íntegramente al final como fuente de trazabilidad. La especificación sintetizada de arriba explica sus reglas en el contexto del flujo. Esta sección conserva formulaciones, respuestas, incertidumbres y aclaraciones originales para evitar que se pierdan matices.

---

Cuestiones A RESOLVER DE REPARA YA/NEXO PRO:


Cuestionario de definición del negocio y funcionamiento
1. Modelo de negocio y suscripciones
Estas preguntas definen cómo gana dinero la plataforma y qué obtiene cada profesional a cambio de su suscripción.
1.1. Modelo de cobro
1. ¿El profesional debe pagar una suscripción mensual obligatoria para utilizar la plataforma? Si
2. ¿El cliente utiliza Repara Ya de manera gratuita? Solo el primer mes que comienza a parir de que se registra el mismo usará el plan basic y por cada mes podrá optar para modificar el plan si no se abona un plan no podrá usar Nexo PRO
3. ¿Repara Ya cobrará alguna comisión por los trabajos realizados? No el profesional solo pagará la suscripción mensual en la página / app, el se quedará con el 100% de lo que gane con su servicio/trabajo
4. ¿Confirmamos que el profesional conserva el 100 % del dinero que acuerda con el cliente? Si
5. ¿La plataforma cobrará únicamente por las suscripciones o también tendrá otros ingresos? principalmente si, se pedirá un pago como multa si es que se banea un perfil con 5 strikes
6. ¿En el futuro se podrán vender espacios publicitarios o posicionamiento patrocinado? Es probable
7. ¿Los precios de los planes estarán expresados en pesos argentinos? Si, siempre
8. ¿Los precios serán fijos o podrán modificarse según la inflación? Fijos, no se descarta que se puedan incrementar
9. ¿Los precios publicados incluirán impuestos o se mostrarán por separado? El precio será uno solo, incluirá todo.
10. ¿Qué medios de pago estarán disponibles para las suscripciones? Mercado pago principalmente, luego se verá la opción de incluir tarjetas de débito
1.2. Período de prueba gratuito
11. ¿El profesional tendrá un mes gratuito desde que se registra o desde que activa su perfil? Desde que se registra, si no actualiza su  perfil en el periodo de prueba pierde el la prueba
12. ¿El mes de prueba estará disponible para todos los profesionales? Si
13. ¿Un profesional podrá volver a obtener el mes gratuito creando otra cuenta? No, si se encuentra una cuenta igual o similar a otra se bloquearán las 2, no me van a tomar de gil
14. ¿Se solicitará un medio de pago antes de comenzar la prueba? El profesional se registra, completa su perfil y comienza a utilizar las funcionalidades de su plan sin ingresar un medio de pago antes de los 30 dias. luego de los 30 días de prueba se solicitará el pago para continuar. 
15. ¿La suscripción se cobrará automáticamente cuando finalice el período de prueba? Si puedo configurarlo asi si, y se avisara en el términos y condiciones
16. ¿Se notificará al profesional antes de que termine su prueba? Obvio un contador de días restantes antes de que finalice la prueba free 
17. ¿Qué sucede si el profesional no contrata un plan al finalizar el mes gratuito? Se oculta el perfil que creo y no se le dará acceso a sus funcionalidades ni a interactuar y le aparece un mensaje diciendo "Escoje un plan para continuar" o algo asi 
1.3. Cambio de planes
18. ¿Un profesional puede cambiar de Basic a Medium o Premium en cualquier momento? Si, mientras pague si jaja
19. ¿El cambio de plan se aplica inmediatamente o al finalizar el período abonado? Al momento, generaría disgusto si el usuario debe esperar para usar algo que pago
20. ¿Si sube de plan, debe pagar la diferencia? si quiere hacer el cambio de plan hasta 10 dias pasados en los cuales el pago un plan anterior, ahí si pagará solamente la diferencia, si se pasa de los 10 días ahí no podrá cambiar de plan hasta terminar los 30 días del plan anterior y pasado el mes tendrá que abonar el monto total de cada plan, ya sean los $15.000 del plan médium o $20.000 del plan Premium
21. ¿Si baja de plan, pierde inmediatamente las funcionalidades del plan anterior? No existirá la opción de bajar un plan, solo la de desuscribirse para que se deje de débitar y en caso de que se desuscriba el plan seguirá vigente hasta cumplir los 30 días acordados y si quiere un plan nuevamente tendrá que abonar los montos indicados.
22. ¿Qué ocurre con los videos, imágenes, profesiones adicionales o personalizaciones que excedan los límites del nuevo plan? Por cada plan se habilitaran opciones para agregar imágenes videos y demás, si no pago por el plan que las permite directamente no tendrá esas opciones
23. ¿Puede el administrador cambiar manualmente el plan de un profesional? Si, siempre y cuando haya un acuerdo mutuo entre las 2 partes 
24. ¿El administrador debe indicar un motivo para realizar ese cambio? Será casi inpensado dar una baja de plan manualmente por el admin a menos que lo pidea expresamente el profesional
1.4. Impago o cancelación 
Si un profesional deja de pagar, tenemos que decidir:
25. ¿Su perfil desaparece del catálogo? No se borra nada, (por si es que cambia de opinión y decide volver a utilizar la app) solo se ocultará su perfil al publico y no estará disponible para solicitar los servicios del profesional que no pago.
26. ¿Se mantiene visible, pero con un perfil limitado? No se vé al publico
27. ¿Puede seguir recibiendo mensajes? No
28. ¿Puede responder a clientes? No
29. ¿Puede consultar sus conversaciones anteriores? No
30. ¿Puede seguir administrando sus contrataciones activas? No
31. ¿Puede finalizar trabajos que ya había aceptado? No 
32. ¿Puede seguir consultando los datos de sus clientes con contrataciones activas? Solo si lo solicita al administrador y si el administrador decide que se las otorgará 
33. ¿Puede seguir utilizando el foro? Solo para visualizar (básicamente tendrá el mismo nivel de interacción de un usuario No registrado)
34. ¿Puede contratar otro plan? Obvio
35. ¿Cuánto tiempo tiene para regularizar el pago antes de que se limite su cuenta? si no paga en los 30 días luego de usar un plan se le cobrarán intereses cuando vuelva a recontratar un plan, intereses del 3%
36. ¿Qué sucede si el pago falla por un problema temporal? Se reporta al equipo de soporte y se revisa el problema o incidencia 
37. ¿Qué sucede si el profesional cancela voluntariamente su suscripción? el plan seguirá vigente mientras este en los 30 días indicados, luego de los 30 días se ocultara el perfil
38. ¿La cancelación se hace efectiva inmediatamente o al terminar el período abonado? no entendi
39. ¿El profesional conserva su perfil, sus reseñas y su historial si vuelve a pagar en el futuro? Si, lo que pasará si abandona o no paga es que se ocultará su perfil al publico
1.5. Visibilidad y posicionamiento
40. ¿Los profesionales Basic aparecerán en el catálogo junto con los Medium y Premium? Si obviamente
41. ¿Qué significa exactamente «aparecer entre los primeros» para el plan Medium? que en las cards de profesionales estos estarán junto con los que tengan 4 o 5 estrellas de puntuación, y si se filtra por "mejores valorados" estos plan medum y premium estarán entre los primeros
42. ¿El posicionamiento Premium será superior al Medium? Si     
43. ¿Los resultados patrocinados estarán claramente identificados? Se verá mientras crezca la aplicación, pero en principio Si
44. ¿Los profesionales podrán pagar adicionalmente para aparecer en una zona o búsqueda determinada? Es buena idea hay que verla mas a futuro como una posible implementación 
45. ¿La ubicación, la disponibilidad, las valoraciones y los trabajos realizados también influirán en el orden? No entendí 
46. ¿Cómo evitaremos que el catálogo muestre siempre a los mismos profesionales? se evaluara las puntuaciones, cantidad de trabajos realizados en la app (contrataciones reales), visualizaciones de el detalle de un profesional por parte de usuarios registrados y no registrados, todos esos datos tomados por dia, semana o mes. 

2. Registro, autenticación y verificación
Esta sección es fundamental porque tu idea busca proteger tanto a clientes como a profesionales.
2.1. Registro
1. ¿Una persona puede registrarse como cliente y profesional con la misma cuenta? No es uno o otro no ambos
2. ¿Puede cambiar de rol posteriormente? Si
3. ¿Puede tener ambos roles activos al mismo tiempo? No
4. ¿Qué datos serán obligatorios para registrarse como cliente? Nombre, apellido, foto de perfil, email, DNI, teléfono, provincia, localidad, barrio 
5. ¿Qué datos serán obligatorios para registrarse como profesional? Nombre, apellido, foto de perfil, profesion/oficio, email, DNI, teléfono, provincia, localidad, barrio
6. ¿El registro con Google será opcional o obligatorio? Es una opción que si estará en la pagina para mejorar la UX 
7. ¿Se solicitará verificar el correo electrónico? Principalmente No (si es fácil la verificación entonces si)
8. ¿Se solicitará verificar el número de teléfono? Principalmente No (si es fácil la verificación entonces si)
9. ¿Una cuenta podrá iniciar sesión desde varios dispositivos? Si obvio
10. ¿Qué sucede si una persona pierde el acceso a su cuenta? Se blanquearan las credenciales con el equipo de soporte
2.2. Verificación de identidad
11. ¿Qué significa que un cliente esté «verificado»? Verificación facial, foto de DNI frente y reversa (si es que es fácil de implementar)
12. ¿Qué significa que un profesional esté «verificado»? Se muestre su cara y concuerde con la foto del DNI
13. ¿La verificación será automática, manual o una combinación? Automatica por la app manual para el profesional y cliente como en los bancos 
14. ¿Se solicitará DNI? Si es importante 
15. ¿Se solicitará una fotografía del documento? Si
16. ¿Se solicitará una selfie para comprobar la identidad? Si
17. ¿Los profesionales deberán presentar certificados de formación? Es opcional pero hacer esto incrementa la confiabilidad a los clientes
18. ¿Quién revisará esos certificados? El admin y podrán verlo los clientes
19. ¿Qué diferencia habrá entre un profesional verificado y uno no verificado? Solamente el certificado que se vera en el detalle y la fiabilidad de contrataciones por parte de los clientes
20. ¿El administrador podrá aprobar, rechazar o revocar una verificación? SI(?
21. ¿Qué información de verificación se mostrará públicamente? Ninguna solo son datos filtros
22. ¿Qué ocurre si una persona no completa la verificación? No podrá hacerse una cuenta 
23. ¿Podrá navegar, publicar en el foro o solicitar servicios mientras está pendiente? No
2.3. Seguridad de las cuentas
24. ¿Qué medidas se tomarán para evitar cuentas falsas? verificación con foto de perfil y DNI (sobre todo a los profesionales)
25. ¿Cómo se detectarán cuentas duplicadas? A revisar de todas formas me conviene a mi ya que va a tener que pagar 2 planes jajaja de todas formas esta la verificación 
26. ¿Qué sucede si un usuario intenta crear una nueva cuenta después de ser sancionado? Se penalizara 
27. ¿Se notificará al usuario cuando se inicie sesión desde un dispositivo desconocido? Principalmente No (si es fácil la verificación entonces si)
28. ¿Qué acciones podrá realizar una persona si cree que su cuenta fue comprometida? Si fue comprometida le daremos de alta a una nueva cuenta con los días que le quedan para terminar el plan 

3. Perfil del profesional
El perfil es uno de los elementos centrales del negocio. Tenemos que definir qué información contiene y cómo se administra.
3.1. Información del perfil
1. ¿Qué datos serán obligatorios para crear un perfil profesional?  Nombre, apellido, foto de perfil, profesion/oficio, email, DNI, teléfono, provincia, localidad, barrio
2. ¿El nombre y apellido serán siempre visibles? Si
3. ¿El profesional podrá utilizar un nombre comercial? Si lo quiere si 
4. ¿El número de teléfono y el email estarán visibles públicamente? Si
5. ¿El profesional podrá ocultar esos datos y comunicarse únicamente mediante el chat? No no tendrá esa posibilidad para empezar
6. ¿La descripción tendrá un límite de caracteres? 200 Caracteres 
7. ¿Podrá indicar años de experiencia? Si
8. ¿Podrá indicar zonas de cobertura? Si 
9. ¿Podrá indicar si trabaja solo o con un equipo? Si
10. ¿Podrá definir un precio estimado o tarifa de referencia? Si
11. ¿Podrá indicar si cobra por visita, hora o trabajo completo? Si
12. ¿Podrá indicar si ofrece presupuestos gratuitos? Si
3.2. Fotografías, videos y certificados 
13. ¿Cuántas fotografías de perfil podrá subir? depende del plan 
14. ¿Cuántas fotografías de trabajos podrá subir según cada plan? básico 5 imágenes (2 para presentarse / 3 para mostrar trabajos), médium 5 img + 1 video(2 imágenes /1 video  /3 para mostrar trabajos), premium 2 videos + 4 img ( 1 video será para la presentación en el catalogo (se le recomendara que el video sea: venga caminando desde lejos hacia el frente de la cámara con una cara canchera y al llegar al frente cruzar los brazos y una sonrisa como si estuviera en una cancha de futbol), el otro video para presentarse y las 5 imágenes para lo que el quiera)
15. ¿Qué formatos y tamaños de archivo se permitirán? .png, .jpg, mp4 tamaños se verán luego según sea mas optimo
16. ¿Las imágenes se podrán ordenar? Si 
17. ¿El profesional podrá eliminar o reemplazar imágenes? Si podrán editarlas
18. ¿Los videos serán públicos para cualquier visitante? Si tanto para logueados y no logueados 
19. ¿Los videos deberán ser aprobados por el administrador? No pero si son ofensivos entonces el admin lo podrá eliminar y recibirá un aviso
20. ¿Qué duración máxima tendrá cada video? 15s 
21. ¿Qué sucede si el profesional baja de plan y supera el límite de contenido? no entendi
22. ¿Los certificados serán públicos o solamente mostrarán un distintivo de verificación? púbicos (generan mas confianza) y estarán las certificaciones para todos los planes
23. ¿El administrador podrá ocultar una imagen o video inapropiado? Si
3.3. Profesiones y especialidades
24. ¿Cada profesión tendrá un catálogo predefinido? Será un mismo catalogo general para todas las profesiones pero si se filtra por cada profesión la page cambiará personalizada a dicha profesión/oficio
25. ¿El profesional podrá proponer una profesión que todavía no exista? No
26. ¿Quién aprobará nuevas profesiones? El admin
27. ¿Cómo se relacionarán las profesiones con las búsquedas y los filtros? por la profesión/oficio del profesional y el filtro del catalogo
28. ¿Basic tendrá una profesión, Medium dos y Premium tres? Si 
29. ¿Qué sucede con las profesiones adicionales si baja de plan? Se ocultan como todo el contenido del profesional
30. ¿Podrá elegir una profesión principal y otras secundarias? Si es la idea
3.4. Personalización visual 
31. ¿Qué elementos podrá personalizar el plan Medium? Colores de la secciones, gradientes, tipografías, agregar imágenes de banner, y editar textos
32. ¿Qué elementos adicionales podrá personalizar Premium? Colores de la secciones, gradientes, tipografías, efectos, animaciones, transiciones para cada contenedor, agregar imágenes o videos al banner
33. ¿Habrá plantillas prediseñadas? Si, serán las por defecto y las que estarán en el perfil del plan basic
34. ¿Existirán límites para los colores y las imágenes de banner? no y si solo será 1 imagen para el banner
35. ¿Cómo evitaremos que una personalización perjudique la legibilidad o la experiencia de usuario? Se diseñara el detalle de forma optima
36. ¿El administrador podrá restablecer una personalización que incumpla las reglas de diseño?  No se incumplirán las reglas ya que vendrán predefinidas en el código 

4. Perfil del cliente y privacidad
Tu idea plantea que los profesionales puedan conocer ciertos datos del cliente antes de acudir a su domicilio. Esto requiere definir cuidadosamente qué se muestra y cuándo.
1. ¿Qué datos debe completar obligatoriamente un cliente? ya lo dije
2. ¿El cliente tendrá foto de perfil obligatoria? si
3. ¿Qué datos verá un profesional cuando el cliente le solicite un servicio? Ya lo conteste en otra planilla
4. ¿El profesional podrá ver el perfil del cliente antes de aceptar la solicitud? Si podrá acceder al chat o si quiere al detalle del cliente
5. ¿El cliente podrá ocultar su teléfono o email? No
6. ¿La dirección exacta se mostrará solamente cuando exista una contratación? Si
7. ¿El cliente podrá compartir su ubicación en tiempo real? Si
8. ¿La ubicación en tiempo real se activará únicamente durante un servicio? mientras la app este en uso si el profesional o cliente lo autoriza 
9. ¿El cliente podrá desactivar el acceso a su ubicación? Si
10. ¿Qué datos del cliente serán visibles para otros clientes? Ninguno un cliente no pódra ver a otros clientes un cliente solo podrá ver profesionales
11. ¿Qué datos del cliente serán visibles en el foro? Nombre, apellido, foto de perfil y comentario y la fecha desde la que se unió y de creación del comentario
12. ¿El cliente podrá eliminar su cuenta? Si 
13. ¿Qué sucederá con sus reseñas, publicaciones y contrataciones si elimina la cuenta? Se borraran o quedaran ocultas 
14. ¿El profesional podrá guardar o descargar los datos del cliente? Si, es una buena idea     
15. ¿Durante cuánto tiempo se conservará el historial de contrataciones? siempre
Clasificación de clientes
En tu idea aparecen las categorías «Exigente», «Normal» y «Fácil de complacer».
16. ¿Estas categorías serán visibles para los profesionales? Si 
17. ¿Cómo se calculará cada categoría? Según la puntuación de profesionales a clientes que atendieron, si tiene 1 a 2 estrellas es un cliente exigente, si es de 3 a 4 es normal y si tiene 5 es Fácil de complacer
18. ¿Se utilizarán las puntuaciones que el cliente les da a los profesionales? si
19. ¿Qué relación existe entre la calificación que un cliente otorga y su propia clasificación? Les servirá a los 2 roles para saber que tipo de cliente o profesional le espera conocer
20. ¿El cliente podrá conocer su clasificación? Si, si es mala puede elegir mejorar
21. ¿Podrá solicitar una revisión si considera que es injusta? Si
22. ¿Se podrá reportar un uso discriminatorio o abusivo de esta clasificación? SI OBVIO
23. ¿Esta clasificación influirá en la posibilidad de contratar servicios? No, pero si podrá afectar la motivación de un cliente o profesional (para eso esta)

5. Catálogo, búsqueda y filtros
El catálogo es el principal medio para descubrir profesionales.
1. ¿El catálogo mostrará profesionales cercanos por defecto? Solo si se usa ese filtro de "Cerca de mi"
2. ¿El usuario deberá habilitar su ubicación para utilizarlo? Si sino estará en negrito y se avisara que debe prenderse la ubicacion
3. ¿Qué sucederá si el usuario no permite el acceso a la ubicación? Nada, no recibirá notificaciones y no podrá usar ese filtro, pero puede seguir charlando con profesionales para que vayan a su domicilio
4. ¿El usuario podrá buscar manualmente por localidad, barrio o código postal? Si todo menos el código postal ese ultimo no
5. ¿Cuál será el rango máximo de kilómetros? 5 A 10 KM habrá un input de range 
6. ¿El rango de distancia se medirá desde la ubicación del cliente o desde una zona declarada por el profesional? ambas
7. ¿Qué significa «disponible ya»? que está abierto a solicitudes o contrataciones en ese mismo instante
8. ¿El estado de disponibilidad será actualizado manualmente por el profesional? Si exactamente solo manual
9. ¿La plataforma podrá cambiar automáticamente el estado cuando el profesional tenga una contratación activa? La plataforma no cambiara el estado.
10. ¿Cómo se ordenarán los resultados por valoración? mayor a menor, menor a mayor por filtros
11. ¿Cómo se ordenarán por trabajos realizados? un valor numerico, por ejemplo: cliente pone en el filtro "profesionales que al menos hayan realizado 4 trabajos", query para compara el valor numerico de la cantidad de trabajos
12. ¿Qué significa exactamente «verificado: sí/no»? Si se verifico o no
13. ¿Se podrán combinar varios filtros? Obvio, todas las combinaciones posibles 
14. ¿El catálogo tendrá paginación o carga progresiva? puede ser paginación se vera luego
15. ¿Se mostrarán profesionales que no estén disponibles? Si obvio quizás luego de que se desocupe alguien lo vea y contrate o alguien espere a que se desocupe para contratarlo
16. ¿Se mostrarán profesionales con suscripción vencida? No 
17. ¿Cómo se distinguirán los perfiles patrocinados? Marcos de colores y video de presentación en el catalogo
18. ¿Qué ocurre si no hay profesionales disponibles para una búsqueda? Se muestra el mensaje adecuado
19. ¿Se sugerirán otras zonas o profesiones? Si
20. ¿Los usuarios podrán guardar una búsqueda y recibir avisos cuando haya profesionales disponibles? Si es muy buena ideaaaa

6. Disponibilidad y estado de atención
En tu propuesta cada profesional puede estar Disponible, Trabajando/En servicio o Descansando.
1. ¿Qué significa exactamente cada estado? Que esta haciendo un cliente para saber de ante mano si el cliente podría recibir una respuesta inmediatamente (disponible), si el profesional esta trabasjando sabrpa el cliente que puede tardar y si esta descansando el cliente sabra que no recibirá respuesta
2. ¿El profesional cambiará su estado manualmente? Si
3. ¿La plataforma podrá modificarlo automáticamente? Si según los horarios que establezca el profesional
4. ¿El estado Disponible tendrá una hora de vencimiento? Si los que establezca el profesional 
5. ¿El profesional podrá programar sus horarios semanales? Si 
6. ¿Podrá indicar días de descanso, feriados o vacaciones? Si
7. ¿Podrá definir horarios diferentes por profesión? No, mismos horarios y el se organizara para ver que profesión aplica
8. ¿Podrá estar disponible para una profesión y no para otra? No, los estados siguen iguales será la profesión que elija ejercer la que cambien y lo que pida el cliente 
9. ¿Qué sucede si recibe varias solicitudes al mismo tiempo? El cliente decidirá cual querrá aceptar y podrá rechazar otras ofertas (el cliente verá si le aceptaron el pedido del servicio o si se lo cancelaron)
10. ¿Qué sucede si acepta un trabajo y luego recibe otra solicitud? Podrá aceptarlo, hablar con ambos clientes y acordar atender a uno y luego atender al otro en otra hora, o rechazar el segundo pedido 
11. ¿El estado Trabajando se activará al aceptar una solicitud o al comenzar el trabajo? Al aceptar una solicitud ya que estará ocupado desde ese momento, ya sea yendo al domicilio del cliente y demas
12. ¿El profesional podrá estar disponible mientras tiene un trabajo en curso? no
13. ¿Se mostrarán los horarios locales de la zona del profesional? no solo los horarios de atención del cliente 
14. ¿Qué sucede si el profesional no actualiza su estado durante varios días? nada la plataforma sigue normal
15. ¿La plataforma enviará una notificación cuando vuelva a estar disponible? Si a partir del plan médium y premium en el basic No
16. ¿El usuario podrá elegir qué profesionales desea seguir para recibir esos avisos? Si, es buena idea "Recibir notificaciones de este profesional" se puede hacer una sección en la dashboard del cliente de "Notificaciones de profesionales seleccionados" hay que hacerlo
17. ¿El usuario podrá cancelar la suscripción a esas notificaciones? Podra anular los avisos de las notificaciones generales o de los profesionales seleccionados

7. Solicitud, contratación y ciclo de un trabajo
Este es uno de los flujos más importantes que debemos definir antes de diseñar las entidades de la base de datos.
7.1. Inicio de la solicitud
1. ¿Cómo comienza una solicitud de servicio? En el detalle o catalogo de un profesional habrá un CTA para chatear con el y solicitar un servicio y allí entablarán el problema, precio y visita al domicilio, es autogestionado por cliente y profesional, la plataforma no interviene
2. ¿El cliente debe describir el problema antes de enviar la solicitud? Todos los detalles por el chat entre el y el profesional
3. ¿Podrá adjuntar fotografías o videos? Si
4. ¿Debe seleccionar una profesión? No es necesario, con clickear el CALL TO ACTION de la card del catalogo del profesional o el CALL TO ACTION del detalle ya se estará implícitamente seleccionando la profesión/oficio
5. ¿Debe indicar una dirección o ubicación? TODOS LOS DATOS POR CHAT
6. ¿Debe indicar una fecha y un horario preferidos? TODOS LOS DATOS POR CHAT
7. ¿Podrá indicar urgencia? Si, es buena, una petición con el estado, puede esperar, impaciente, urgente hay que hacerlo 
8. ¿Podrá enviar solicitudes a varios profesionales al mismo tiempo? si
9. ¿El profesional recibirá una notificación inmediata? si
10. ¿La solicitud se abrirá automáticamente en un chat? si 
11. ¿El cliente podrá cancelar la solicitud antes de que el profesional responda? si puede dar click en un botón "cancelar" y automáticamente aparecerá un mensaje en el chat "Ya lo solucione, disculpas por la molestia"
7.2. Respuesta del profesional
12. ¿El profesional puede aceptar, rechazar o pedir más información? TODOS LOS DATOS POR CHAT
13. ¿Puede enviar un presupuesto? TODOS LOS DATOS POR CHAT
14. ¿El presupuesto será un importe fijo, estimado o por hora? TODOS LOS DATOS POR CHAT
15. ¿El profesional podrá modificar el presupuesto? TODOS LOS DATOS POR CHAT
16. ¿El cliente debe aceptar el presupuesto dentro de un plazo? TODOS LOS DATOS POR CHAT
17. ¿Qué sucede si el profesional no responde? Nada
18. ¿La solicitud puede ser aceptada por más de un profesional? Si pero el cliente puede elegir a cual contratar y cuando elija a 1 se le enviarán los mensajes a los demás que seleccionaron el pedido diciendo "El cliente {nombre} ya selecciono a un profesional"
19. ¿Qué ocurre si el cliente elige a otro profesional? contestado en la pregunta de arriba 
20. ¿El profesional podrá proponer otra fecha u horario? TODOS LOS DATOS POR CHAT
21. ¿El cliente podrá negociar el precio desde el chat? TODOS LOS DATOS POR CHAT
7.3. Estados del trabajo
22. ¿Qué estados tendrá una contratación?

Por ejemplo, podríamos evaluar:
- Solicitud enviada.
- Pendiente de respuesta.
- Presupuesto enviado.
- Presupuesto aceptado.
- Trabajo programado.
- Trabajo en curso.
- Trabajo finalizado.
- Cancelado.
- En disputa.
23. ¿Qué estados son necesarios realmente? Los que concuerden con lo dicho anteriormente y los mas optimos para el contexto de la app
24. ¿Quién puede cambiar cada estado? solo Profesionales
25. ¿El profesional podrá marcar el trabajo como finalizado? Si
26. ¿El cliente deberá confirmar la finalización? No es necesario
27. ¿Qué sucede si el cliente no confirma? Nada
28. ¿Qué sucede si el profesional marca como finalizado un trabajo que no realizó? El cliente lo puede reportar y dejar una reseña negativa sobre ese profeisonal
29. ¿Qué sucede si el trabajo queda parcialmente realizado? El cliente lo puede reportar y dejar una reseña negativa sobre ese profeisonal
30. ¿Se podrá reabrir una contratación? se hará una nueva
31. ¿Se podrá registrar un cambio de presupuesto durante el trabajo? Esos detalles se acuerdan entre las 2 partes cliente y profesional
32. ¿Se conservará un historial de todos los cambios de estado? No solamente de los clientes atendidos por parte de los profesionales y los profesionales contratados por parte de los clientes
7.4. Cancelaciones y conflictos
33. ¿El cliente puede cancelar una contratación aceptada? Si
34. ¿El profesional puede cancelar una contratación aceptada? Si
35. ¿Se exigirá una justificación? Opcional pero seria una accion recomendada para la parte que cancele
36. ¿Habrá penalizaciones por cancelaciones reiteradas? Si
37. ¿Qué sucede si el profesional no se presenta? El cliente lo puede reportar y dejar una reseña negativa sobre ese profeisonal
38. ¿Qué sucede si el cliente no está en el domicilio? El profesional lo puede reportar y dejar una reseña negativa sobre ese cliente o charlar mediante el chat con el cliente para confirmar ubicacion
39. ¿Cómo se reporta un desacuerdo sobre el precio? El cliente lo puede reportar y dejar una reseña negativa sobre ese profesional (aunque eso se arregla entre las partes)
40. ¿La plataforma tendrá un procedimiento de mediación? eso se arregla entre las partes
41. ¿Quién podrá marcar una contratación como disputada? eso se arregla entre las partes
42. ¿Qué puede hacer el administrador cuando hay un conflicto? eso se arregla entre las partes SI ES UN REPORTE SERIO O CRITICO SE REVISARÁ EL CASO
43. ¿Se permitirá que las partes continúen comunicándose durante una disputa? eso se arregla entre las partes
44. ¿Qué sucede con la reseña si el trabajo queda en disputa? eso se arregla entre las partes y tanto el profesional como el cliente son libres de opinar libremente siempre con respeto 

8. Chat en tiempo real y comunicación
Tu idea plantea que los usuarios y profesionales registrados puedan conversar desde la plataforma.
1. ¿Quién puede iniciar una conversación? Siempre la comienza el Cliente (no se descarta que también pueda hacerlo el profesional en un futuro)
2. ¿Un cliente puede escribirle a cualquier profesional o solamente después de una solicitud? A cualquiera, lo ético seria que si contrata se quede con uno pero tiene libertad
3. ¿Un profesional puede escribirle a un cliente sin que este lo haya contactado? Se verá mas a futuro en principio No 
4. ¿El chat se habilita antes o después de solicitar el servicio? El chatbot premium se habilita luego del primer mensaje del cliente al profesional 
5. ¿El chat estará vinculado a una contratación? Si y a las dudas del cliente 
6. ¿Un cliente podrá tener varios chats con el mismo profesional? No es uno solo
7. ¿Se podrán enviar imágenes? Si
8. ¿Se podrán enviar videos? Si
9. ¿Se podrán enviar documentos o certificados? en forma de imágenes solamente
10. ¿Se podrán enviar mensajes de voz? No
11. ¿Se mostrará si el usuario está en línea? Si es buena
12. ¿Se mostrará si el mensaje fue leído? Si
13. ¿Se podrán editar o eliminar mensajes? Si
14. ¿Se podrán reportar mensajes? Si
15. ¿Qué sucede con el chat cuando la contratación finaliza? Nada queda ahi
16. ¿Qué sucede con el chat si el profesional deja de pagar? No podrá utilizar la plataforma, si no paga tendrá el mismo nivel de funcionalidades que un usuario No registrado
17. ¿Se conservará el historial de conversaciones? si pero en un mes se borrarán los chats (ya se verán esos temas legalmente) 
18. ¿El administrador podrá acceder a las conversaciones en caso de reporte o disputa? Si
19. ¿Se permitirá compartir teléfonos, emails o enlaces externos? eso se arregla entre las partes (cada uno debe tener las precauciones adecuadas) eso estará en términos y condiciones
20. ¿La plataforma tendrá mecanismos para prevenir spam o intentos de estafa? Es ideal si es fácil de implementar se hace

9. Foro general
El foro tiene dos grandes tipos de publicaciones: consultas y solicitudes de profesionales.
9.1. Publicaciones
1. ¿Qué campos tendrá una publicación de tipo Consulta? Nombre apellido, foto de perfil del cliente, fecha de publicación, fecha en la que se registro el cliente, descripción de la publicación y foto opcional
2. ¿Qué campos tendrá una publicación de tipo Solicito Profesional? Nombre apellido, foto de perfil del cliente, fecha de publicación, fecha en la que se registro el cliente, descripción de la publicación y foto opcional
3. ¿El usuario podrá adjuntar fotografías? Si
4. ¿Cuántas fotografías podrá adjuntar? 2 
5. ¿Se podrán adjuntar videos? solo 1 de menos de 15 segundos
6. ¿El usuario deberá seleccionar una profesión? Si lo desea si 
7. ¿Podrá seleccionar varias profesiones? Si lo desea si 
8. ¿Podrá indicar localidad o zona? Si lo desea si 
9. ¿Podrá indicar un presupuesto estimado? Si lo desea si 
10. ¿Podrá indicar una fecha límite? Si lo desea si 
11. ¿Las publicaciones tendrán fecha de vencimiento? No 
12. ¿El usuario podrá editar o eliminar una publicación? Si lo desea si 
13. ¿Qué sucede cuando ya encontró un profesional? Nada podrá marcar la publicación como "resuelta" y desde allí no podrán comentar mas nadie
14. ¿Podrá marcar la publicación como resuelta? Si lo desea si 
15. ¿La publicación seguirá visible después de ser resuelta? Si lo desea si 
9.2. Respuestas e interacción
16. ¿Quién puede responder? clientes y profesionales 
17. ¿Los profesionales podrán responder con un presupuesto? podrán responder con absoluta libertad 
18. ¿El cliente podrá seleccionar a un profesional desde una respuesta? Podrá ver el detalle de un profesional y luego decidir si contratarlo o no
19. ¿La selección iniciará un chat?  Podrá ver el detalle de un profesional y luego decidir si contratarlo o no
20. ¿Se podrán responder comentarios? Si por ambas partes 
21. ¿Cuántos niveles de respuestas tendrá el foro? los que dure la conversacion
22. ¿Se mostrarán las respuestas mediante dropdown? si
23. ¿Se podrán editar o eliminar respuestas? si
24. ¿Se podrán denunciar publicaciones o comentarios? si 
25. ¿Se podrá dar «Me gusta» o reaccionar? si
26. ¿Se notificará al autor cuando alguien responda? si y a profesional también si se le responde 
27. ¿Los usuarios no registrados podrán ver todas las respuestas? si obvio, ver como interactúan ambas partes es fundamental 
28. ¿Qué información del autor se mostrará públicamente? ya lo conteste antes: Nombre apellido, foto de perfil del cliente, fecha de publicación, fecha en la que se registro el cliente, descripción de la publicación y foto opcional
29. ¿Cómo se evitarán publicaciones repetidas o spam? se podrán reportar y el admin podrá eliminarlas 

10. Calificaciones, reseñas y reputación
La reputación puede ser uno de los principales factores de confianza de Repara Ya.
1. ¿El cliente podrá calificar solamente a profesionales con los que haya contratado? puede ser en cualquier momento 
2. ¿La calificación se habilitará únicamente cuando el trabajo esté finalizado? puede ser en cualquier momento 
3. ¿El cliente podrá dejar una reseña sin asignar estrellas? puede ser en cualquier momento 
4. ¿La calificación será de 1 a 5 estrellas? si 
5. ¿La reseña tendrá un límite de caracteres? si
6. ¿El cliente podrá adjuntar fotografías a una reseña? no
7. ¿El profesional podrá responder públicamente a una reseña? si
8. ¿El cliente podrá editar una reseña? si el realizo la reseña si, los roles no podrán eliminar o editar reseñas de terceros
9. ¿El cliente podrá eliminar una reseña? si es propia si
10. ¿El profesional podrá reportar una reseña? si
11. ¿El administrador podrá ocultar o eliminar reseñas? si
12. ¿Qué criterios se utilizarán para decidir si una reseña es abusiva o falsa? no entendí 
13. ¿Se mostrará el promedio de estrellas? si
14. ¿Se mostrará la cantidad total de reseñas? si 
15. ¿Las reseñas más recientes tendrán prioridad? si
16. ¿Cómo se calculará la puntuación de un profesional con pocas reseñas? con estrellas de 1 al 5 
17. ¿Las reseñas de trabajos cancelados estarán permitidas? nose
18. ¿Se permitirá que un cliente califique a un profesional más de una vez? solo una reseña por servicio solicitado
19. ¿La calificación será visible aunque el profesional deje de pagar? no ya que este estará oculto 
20. ¿El profesional podrá conservar sus reseñas al cambiar de plan? Si obvio
21. ¿Los clientes podrán calificar también a los profesionales en aspectos como puntualidad, trato y calidad? todo esto esta contemplado en estrellas de 1 al 5 si quiere mas profundidad puede dejar una reseña 
22. ¿Se podrán dejar reseñas sobre la propia plataforma? Si 
23. ¿Las reseñas sobre Repara Ya serán públicas o privadas? el admin podrá manejar eso pero principalmente publicas 

11. Notificaciones
Tenemos que definir no solo qué notificaciones existen, sino también quién las recibe, por qué canal y bajo qué condiciones.
11.1. Notificaciones dentro de la plataforma
1. ¿Qué eventos generarán notificaciones? Ya lo especifique en otra planilla
2. ¿Las notificaciones aparecerán en tiempo real? Si
3. ¿Se mostrará un contador de notificaciones no leídas? puede ser
4. ¿El usuario podrá marcar una notificación como leída? si
5. ¿Podrá eliminar notificaciones? no, solo como leida para que no moleste
6. ¿Se conservará un historial? si
7. ¿Habrá categorías de notificaciones? puede ser
8. ¿El usuario podrá desactivar determinadas categorías? podrá desactivar las notificaciones si 
9. ¿Las notificaciones importantes serán obligatorias? no
10. ¿Se podrá abrir directamente el chat, publicación, perfil o contratación desde la notificación? si, es la idea
11.2. Canales
11. ¿Qué notificaciones se enviarán por email? ya se verá mas a fondo luego
12. ¿Cuáles se enviarán por WhatsApp? ya se verá mas a fondo luego
13. ¿Cuáles se enviarán únicamente dentro de la plataforma? ya se verá mas a fondo luego
14. ¿Se enviarán notificaciones push en el navegador? no entendí 
15. ¿El usuario deberá dar consentimiento para recibir WhatsApp? Si 
16. ¿Se permitirá configurar horarios en los que no se envíen notificaciones? puede ser
17. ¿Qué sucede si un mensaje no puede entregarse? se marcar como error 
18. ¿Se enviarán recordatorios de citas? Si
19. ¿Se enviarán recordatorios de suscripciones próximas a vencer? Si
20. ¿Se enviarán avisos de pagos fallidos? si

12. Chatbot y agenda automática Premium
El chatbot Premium es una funcionalidad importante, pero requiere definir con precisión qué podrá hacer sin intervención humana.
1. ¿El chatbot responderá preguntas frecuentes sobre el profesional? Si
2. ¿Podrá responder consultas específicas sobre los servicios? si
3. ¿Qué información podrá utilizar para responder? la que le dé el profesional como contexto
4. ¿El profesional podrá cargar respuestas predefinidas? si
5. ¿El profesional podrá definir horarios de atención del chatbot? el chat estará activo 24hs
6. ¿El chatbot podrá consultar la disponibilidad del profesional? si a travez del estado y horarios de atención del mismo
7. ¿Podrá proponer horarios de cita? no
8. ¿Podrá confirmar una cita sin que el profesional la apruebe? si el profesional lo autoriza si
9. ¿El cliente podrá cancelar o modificar una cita con el chatbot?  si
10. ¿El chatbot podrá enviar presupuestos? no
11. ¿Podrá negociar precios? no
12. ¿Qué límites tendrá para evitar comprometer al profesional con información incorrecta? el profesional indicará los limites
13. ¿El chatbot indicará claramente que es un asistente automatizado? Si
14. ¿El profesional podrá revisar las conversaciones que atendió el chatbot? si
15. ¿El profesional podrá desactivarlo en cualquier momento? si
16. ¿Qué sucede si el chatbot no sabe responder? dará un mensaje diciendo "En este momento no puedo responder a tu consulta"
17. ¿Cómo se derivará la consulta al profesional? el chat-bot estará en el mismo chat que usa el profesional
18. ¿Qué datos de una cita deberá confirmar el cliente? los ya especificados
19. ¿Qué información se enviará por WhatsApp y email? mensajes que enviará el administrador o clientes al profesional el admin podrá enviarle a todos los roles
20. ¿El cliente deberá aceptar recibir esos mensajes? no, si el habla ya da su consentimiendo para un chat
21. ¿Qué sucede si el profesional deja de tener Premium mientras tiene citas agendadas? Nada, tendrá que pagar para mantenerlas sino se ocultara
22. ¿El chatbot podrá seguir administrando citas ya confirmadas? no tiene sentido la pregunta 
23. ¿Qué sucede si el profesional cambia sus horarios después de que se agendó una cita? Nada respeta el horario acordado en una cita y las que siguen se tendrán que adaptar 

13. Dashboard del cliente y del profesional
13.1. Dashboard del cliente
1. ¿Qué información aparecerá al ingresar? Ya lo especifique en otra palanilla
2. ¿Se mostrará un resumen de solicitudes activas? No solo una sección de "Solicitudes" filtradas por activas, leidas, resueltas o algo asi 
3. ¿Se mostrarán próximas citas? pregunta sin sentido
4. ¿Se mostrarán conversaciones recientes? si duraran un mes guardadas
5. ¿Se mostrarán favoritos? si
6. ¿Se mostrarán reseñas pendientes? si
7. ¿Se mostrarán notificaciones? si
8. ¿El cliente podrá modificar sus datos personales? si 
9. ¿Podrá administrar su ubicación? si 
10. ¿Podrá configurar preferencias de notificación? si
11. ¿Podrá consultar su historial de trabajos? en el detalle del profesional tendrá la info
12. ¿Podrá volver a contratar a un profesional desde el historial? si lo desea si, se guardara en favoritos un profesional
13. ¿Podrá descargar o compartir comprobantes de sus contrataciones? no
13.2. Dashboard del profesional
14. ¿Qué información aparecerá al ingresar? Ya lo especifique en otra palanilla
15. ¿Se mostrará un resumen de solicitudes pendientes? eh?
16. ¿Se mostrarán trabajos activos y próximas citas? pregunta sin sentido
17. ¿Se mostrarán chats recientes? si
18. ¿Se mostrarán métricas del perfil? si depende el plan si es premium solamente.
19. ¿Se mostrará el estado actual de atención? si 
20. ¿Se mostrará el plan contratado y su vencimiento? si 
21. ¿El profesional podrá administrar sus medios de pago? a futuro si, primero será con mercado pago o stripe
22. ¿Podrá ver su historial de suscripciones? si
23. ¿Podrá administrar sus fotos, videos y certificados? si 
24. ¿Podrá administrar profesiones y zonas de cobertura? si 
25. ¿Podrá administrar horarios y disponibilidad? si
26. ¿Podrá gestionar el chatbot y sus respuestas? si (depende plan)
27. ¿Podrá consultar sus reseñas? si
28. ¿Podrá gestionar sus notificaciones? si 
29. ¿Podrá enviar reportes al soporte desde el dashboard? si igual que el cliente 

14. Dashboard del administrador
Como administrador, vas a necesitar herramientas para gestionar usuarios, publicaciones, suscripciones y problemas de la plataforma.
1. ¿Qué información aparecerá en el dashboard administrativo? todo sobre el profesional y el cliente, literalmente todo lo que sea administrable con el contexto que tenes arribas podré verlo o interactuar yoque soy el admin
2. ¿Se mostrará la cantidad total de clientes? si
3. ¿Se mostrará la cantidad total de profesionales? si
4. ¿Se mostrará la cantidad de profesionales por plan? si
5. ¿Se mostrarán las suscripciones activas, vencidas y con pagos pendientes? si
6. ¿Se mostrarán las nuevas cuentas registradas? si
7. ¿Se mostrarán las nuevas publicaciones? si
8. ¿Se mostrarán los reportes pendientes? si
9. ¿Se mostrarán los usuarios sancionados? si
10. ¿Se mostrarán las estadísticas generales del negocio? si
11. ¿El administrador podrá buscar usuarios por nombre, email, rol o estado? si
12. ¿Podrá ver el perfil completo de un cliente? si
13. ¿Podrá ver el perfil completo de un profesional? si
14. ¿Podrá revisar las verificaciones pendientes? si
15. ¿Podrá aprobar o rechazar verificaciones? si
16. ¿Podrá cambiar un plan manualmente? si
17. ¿Podrá suspender una suscripción? no
18. ¿Podrá enviar mensajes individuales? si
19. ¿Podrá publicar anuncios y novedades? si
20. ¿Podrá ocultar publicaciones? si 
21. ¿Podrá eliminar cuentas? si
22. ¿Podrá restaurar cuentas eliminadas o suspendidas? si
23. ¿Podrá revisar reportes de clientes y profesionales? si
24. ¿Podrá consultar conversaciones en caso de una denuncia? si
25. ¿Qué acciones administrativas deberán quedar registradas en un historial? clientes/ cuentas eliminadas, por cada profesional fecha de pago, planes y registro de todo lo que puedan hacer los profesionales y clientes reseñas todo
26. ¿Habrá otros administradores en el futuro? no, al menos al principio, no se planea el uso de otro admin
27. ¿Qué permisos tendrá cada administrador? todos jaja
28. ¿Qué acciones requerirán confirmación antes de ejecutarse? eliminar cuentas, ocultar comentarios y todos los que consideres necesarios de validar antes de ejecutar

15. Moderación, reportes, strikes y sanciones
Tu idea establece un sistema de strikes con sanciones progresivas. Tenemos que transformar esa idea en reglas concretas.
15.1. Reportes
1. ¿Quién puede reportar a quién? bidireccional ambos roles client. prof.
2. ¿Qué motivos de reporte estarán disponibles? ya se verá mas a profundidas, después haceme una lista clara, discriminación, falta de respeto, llegada tarde, no acorde al pago principal, etc...
3. ¿El usuario podrá escribir una explicación? si
4. ¿Podrá adjuntar capturas, imágenes o archivos? si
5. ¿Se podrá reportar una publicación? si es ofensiva si
6. ¿Se podrá reportar un mensaje? si
7. ¿Se podrá reportar un perfil? si
8. ¿Se podrá reportar una contratación? no
9. ¿Se podrá reportar una reseña? si
10. ¿El usuario recibirá confirmación de que su reporte fue enviado? si feedback visual al estilo sweetalert o variaciones mas modernas en el frontend
11. ¿Podrá consultar el estado del reporte? si enviado, en revisión, revisado
12. ¿Se notificará al denunciado? si
13. ¿Qué información del denunciante se mantendrá privada? toda
15.2. Strikes
14. ¿Qué situaciones generan un strike? 3 reportes, 5 calificaciones negativas seguidas, mas de 4 reseñas negativas y demás parámetros que consideres apropiados para este campo chat 
15. ¿Todos los strikes tendrán el mismo peso? no, algunos mas leves que otros 
16. ¿Quién decide si un reporte es válido? El admin
17. ¿Un strike se asignará automáticamente o después de una revisión? automaticamente
18. ¿El usuario podrá apelar un strike? si, podrá defenderse explicando el caso
19. ¿Los strikes tendrán vencimiento? No, solo hasta que el admin las vea
20. ¿Se conservará el historial de strikes? si
21. ¿Los strikes se aplicarán tanto a clientes como a profesionales? Si pero se darán mas peso a los profesionales 
22. ¿Un usuario podrá tener strikes en ambos roles? solo habrá 1 rol por usuario
23. ¿Qué significa exactamente una incidencia para el conteo? pregunta sin sentido 
24. ¿Un reporte rechazado contará como strike para el denunciante? no
15.3. Sanciones propuestas
25. ¿Confirmamos que a las tres incidencias la cuenta se ocultará y suspenderá temporalmente? 5 seran
26. ¿Cuánto durará la suspensión? depende la gravedad del caso
27. ¿La duración será igual para todos los casos? no
28. ¿La persona podrá acceder a su cuenta durante la suspensión? no que pregunta decis si justamente esta suspendido no va a acceder. por dios
29. ¿Podrá consultar sus chats y contrataciones activas? no
30. ¿Podrá finalizar trabajos pendientes? no
31. ¿Qué sucede al llegar a cinco strikes? perma-baneo si desea volver a tener la cuenta deberá pagar la multa
32. ¿El baneo permanente impedirá crear otra cuenta? si
33. ¿Cómo se aplicará la multa de $8.000? después del tiempo de la penalización baneo si desea seguir en la app debe abonar ese monto
34. ¿La multa será obligatoria para recuperar la cuenta? si
35. ¿Quién podrá autorizar la reincorporación? solo el admin 
36. ¿Se permitirá apelar un baneo permanente? si 
37. ¿Cómo se manejarán los casos de fraude, amenazas o situaciones graves que requieran una suspensión inmediata? perma-baneo en causa de fraude o amenza permabaneo definitivo sin posibilidad de pagar multa para recupero

16. Seguridad, privacidad y aspectos legales
Estas preguntas no reemplazan la revisión de un abogado, pero ayudan a detectar qué necesita definirse.
1. ¿Qué datos personales recopilará la plataforma?
2. ¿Para qué se utilizará cada dato?
3. ¿Qué datos serán públicos?
4. ¿Qué datos se mostrarán solamente a usuarios autenticados?
5. ¿Qué datos se mostrarán únicamente después de una solicitud?
6. ¿Qué datos podrá consultar el administrador?
7. ¿Cómo se protegerán los datos personales?
8. ¿Cómo se gestionará el consentimiento para la ubicación?
9. ¿Cómo se gestionará el consentimiento para las notificaciones?
10. ¿Qué política habrá para eliminar cuentas y datos?
11. ¿Qué información deberá conservarse por motivos legales o de seguridad?
12. ¿Qué términos aceptará el cliente al registrarse?
13. ¿Qué términos adicionales aceptará el profesional?
14. ¿Qué reglas de comportamiento tendrá la plataforma?
15. ¿Qué advertencias de seguridad se mostrarán antes de contratar?
16. ¿Qué procedimiento se recomendará ante una emergencia o un delito?
17. ¿Qué responsabilidad asumirá la plataforma en relación con los servicios ofrecidos?
18. ¿Qué obligaciones tendrán clientes y profesionales?
19. ¿Cómo se documentarán las disputas?
20. ¿Qué políticas deberán revisar y aprobar el abogado y el fundador antes del lanzamiento?
TODO SOBRE LA SECCION 16 SEGUIRDAD Y PRIVACIDAD SERÁ ATENTIDO LUEGO DE LA ASESORIA REAL Y LEGAL DE UN ABOGADO CALIFICADO, RESPONDER AHORA SERIA SACAR A RELUCIR CONJETURAS SIN FUNDAMENTES O MAL APLICADAS.

17. Contacto, soporte y novedades
1. ¿Cuál será el email oficial de la empresa? me tengo que crear uno, luego confirmare 
2. ¿Cuál será el teléfono oficial? me tengo que crear uno, luego confirmare 
3. ¿Habrá un formulario de contacto? si
4. ¿Qué categorías tendrá el formulario? recomendación, falla, incidencia, reclamo, reporte 
5. ¿Se podrán reportar errores técnicos? si
6. ¿Se podrán enviar sugerencias? si
7. ¿Se podrán reportar conflictos con clientes o profesionales? si
8. ¿Se podrá adjuntar evidencia? si 1 foto
9. ¿El usuario recibirá una respuesta por email, dentro de la plataforma o por ambos medios? plataforma y email propio de un cliente o profesional 
10. ¿Se mostrará un número de seguimiento? no
11. ¿Qué tiempos de respuesta se comunicarán? 48 a 72 hs habiles
12. ¿Quién responderá los reportes? admin
13. ¿Cómo se publicarán anuncios y novedades? admin publica en una sección y le llegara al cliente o profesional  por su dashboard y email
14. ¿Las novedades podrán incluir imágenes o enlaces? si
15. ¿Se podrá enviar una novedad a todos los usuarios o solamente a un grupo? usuarios individuales pero en un solo envió llegar a todos 
16. ¿Se podrán enviar novedades específicas a profesionales de una profesión o plan? si

18. Lanzamiento, crecimiento y alcance inicial
Estas preguntas nos ayudan a definir qué construir primero sin perder de vista la visión completa.
1. ¿Repara Ya se lanzará inicialmente en Córdoba Capital? si
2. ¿Qué barrios o zonas estarán cubiertos en el lanzamiento? todos, depende mas que nada del área que abarque un profesional y ubicación del cliente
3. ¿Qué profesiones estarán disponibles inicialmente? todos
4. ¿Se permitirá que cualquier profesional se registre o habrá una selección inicial? si
5. ¿Cuántos profesionales necesitamos para que el catálogo sea útil? no definido aun
6. ¿Cómo vamos a conseguir los primeros profesionales? contactos y conocidos. además de publicidad en Facebook y demas
7. ¿Cómo vamos a conseguir los primeros clientes? contactos y conocidos. además de publicidad en Facebook y demas
8. ¿Qué funcionalidades son indispensables para el primer lanzamiento? todas las ya mencionadas y un atractivo eslogan de marketing, la pagina estará tan bien diseñada que hablará por si sola 
9. ¿Qué funcionalidades pueden esperar a una segunda etapa? ninguna. se lanzara completo 
10. ¿El foro estará disponible desde el primer lanzamiento? si
11. ¿El chat en tiempo real estará disponible desde el primer lanzamiento? si 
12. ¿Los planes pagos estarán habilitados desde el comienzo? si 
13. ¿El período gratuito se utilizará para captar profesionales? obvio pa
14. ¿Qué métricas nos permitirán saber si el negocio funciona? si
15. ¿Cómo mediremos cuántos usuarios se registran y cuántos realmente contratan? ni idea, hay que verificar eso
16. ¿Cómo mediremos cuántos profesionales reciben solicitudes? ni idea con un contador quizás, el admin vera el detalle de cada cliente o profesional con esos datos 
17. ¿Cómo mediremos cuántos trabajos se completan? según se acepten entre el cliente y profesional
18. ¿Qué cantidad de profesionales suscriptos necesitamos para cubrir los costos? ni idea hay que verificar eso aunque tengo fondos ahorrados lo importante es que me genere plata 
19. ¿Qué feedback vamos a solicitar a los primeros usuarios? que opinan de la pagina, si les resulta fácil de usar, la información del detalle está completa, y demás parámetros que motiven a otros profesionales a registrarse y formar parte de Nexo pro o Repara ya
20. ¿Qué condiciones deben cumplirse antes de expandirnos a otras ciudades? flujo de al menos 80 profesionales registrados y al menos 40 clientes o mas

19. Preguntas especialmente importantes para el diseño de la base de datos
Estas son algunas de las decisiones que más pueden cambiar la estructura de las entidades y sus relaciones.
Suscripción y acceso
- ¿Una cuenta profesional tendrá una única suscripción activa? si, solo una, no dos o mas al mismo tiempo
- ¿La suscripción tendrá estados como prueba, activa, vencida, cancelada o con pago pendiente? Si es optimo para el flujo y contexto que tenes arriba si.
- ¿El historial de suscripciones se conservará? si lo podrá ver el admin 
- ¿Qué pasa con las funcionalidades cuando cambia el estado de la suscripción? se bloquean si se degrada el plan o se habilitan si de mejora de plan
- ¿Qué pasa con el contenido que excede los límites de un plan? si se degrada de plan de bloqueará y si accede a un plan mayor se habilita la opción de integrar la nueva info
Contrataciones
- ¿Una solicitud puede tener varios profesionales asociados? si, pero solo será atendido por un profesional (una solicitud podría tener muchas ofertas pero el cliente decide a quien contratar)
- ¿Una contratación puede tener varios presupuestos? si
- ¿Una contratación puede tener varios cambios de fecha? eso lo ven las partes asociadas cliente y profesional
- ¿Qué estados tendrá una contratación? el que convenga con el flujo de la app y todo el contexto que posees
- ¿Quién puede cambiar cada estado?  el que convenga con el flujo de la app y todo el contexto que posees
- ¿Qué sucede con las contrataciones activas cuando una cuenta es suspendida? ya lo aclaré arriba
Chat
- ¿Una conversación se relacionará con una solicitud? no necesariamente una conversación puede ser meramente para asesorar.
- ¿Una conversación puede existir sin una contratación? si obvio
- ¿Una conversación puede tener más de dos participantes? no, solo cliente y profesional 
- ¿Qué ocurre con los mensajes cuando una cuenta es eliminada? ya lo conteste
- ¿Qué información puede consultar el administrador? toda
Foro
- ¿Una publicación puede seleccionar varias profesiones? solo hasta 4 etiquetas de profesionales
- ¿Una publicación puede tener varias respuestas? si 
- ¿Las respuestas tendrán respuestas propias? si
- ¿Una publicación podrá vincularse con una contratación? si ya lo conteste arriba
- ¿Qué sucede con las respuestas cuando una publicación se elimina? se borran en cascada
Reputación
- ¿Cada contratación finalizada permite una única reseña? si
- ¿Una reseña puede ser editada? si
- ¿Una reseña puede ser reportada? si
- ¿El promedio de estrellas se calculará a partir de todas las reseñas válidas? si 
- ¿Qué pasa con las reseñas si el profesional deja de pagar? se ocultan
Moderación
- ¿Los strikes estarán asociados a la cuenta, al usuario o a cada rol? si
- ¿Una sanción puede afectar solamente al perfil profesional? si
- ¿Qué historial de acciones administrativas se conservará? todas las que se crean oportunas, importantes e indispensables para la perfecta organización y resolución de todas las posiblidades de problemas.
- ¿Qué pasa con los reportes y las pruebas cuando una cuenta se elimina? Se ocultan pero quedan en poder del admin

20. Cómo te recomiendo responder este cuestionario
No intentes resolver todo de una sentada. Para avanzar de forma ordenada, yo lo dividiría en bloques:
Etapa	Temas
1	Modelo de negocio, suscripciones y planes
2	Registro, autenticación y verificación
3	Perfiles de clientes y profesionales
4	Catálogo, búsqueda y disponibilidad
5	Solicitudes, contrataciones y estados
6	Chat y foro
7	Reseñas, reputación y notificaciones
8	Chatbot, agenda y funcionalidades Premium
9	Dashboards y administración
10	Seguridad, sanciones, soporte y cuestiones legales
11	MVP, lanzamiento y crecimiento
