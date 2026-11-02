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
