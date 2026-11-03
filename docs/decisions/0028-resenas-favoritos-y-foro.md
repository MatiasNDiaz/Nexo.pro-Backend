# ADR 0028 — Reseñas, favoritos y foro

- **Fecha:** 03/11/2026 · **Estado:** aprobada · **Resuelve:** C-06, FI §13 y §14.1 (C-07 sigue abierta)

**Decisión.**

1. **Reseñas (C-06):** solo de contrataciones **terminadas** (`COMPLETED`), nunca de las canceladas.
   Una por contratación: 1 a 5 estrellas y comentario opcional de hasta 1000 caracteres, sin imágenes.
   - Se puede reseñar y editar **hasta 30 días después de terminada**. Después solo se puede borrar.
   - El autor puede borrarla siempre; si la borra dentro del plazo, puede volver a reseñar.
   - El profesional responde públicamente (hasta 1000), con plan vigente.
   - El admin la oculta o la restaura con motivo y auditoría.
   - Se muestran el promedio y la cantidad de las visibles; las más recientes primero. Con el perfil
     oculto (sin plan) no se ven, pero se conservan.
2. **Clasificación de clientes (C-07):** no se implementa en esta etapa (riesgo de sesgo y abuso).
3. **Favoritos:** solo clientes, de profesionales del catálogo. Aviso de disponibilidad opcional, que
   se manda solo si el plan del profesional lo incluye (Medium y Premium) y solo cuando el
   profesional se pone "Disponible" a mano. El aviso por horario automático queda para la etapa 13.
4. **Foro:** "Consulta" y "Solicito profesional"; texto de hasta 2000; hasta 2 imágenes y 1 video de
   15 s; hasta 4 profesiones; zona, presupuesto y fecha límite opcionales.
   - Lectura pública. Publican, responden y dan "me gusta" los clientes activos y los profesionales
     con plan vigente; el profesional sin plan solo lee.
   - Respuestas anidadas de hasta 1000. El presupuesto estimado en una respuesta lo ponen solo
     profesionales, en publicaciones "Solicito profesional".
   - El autor edita, borra y marca resuelta: resuelta no admite respuestas nuevas y sigue visible.
     Borrar una publicación oculta también sus respuestas (se conservan para moderar).
   - El admin oculta o restaura publicaciones y respuestas con motivo y auditoría.
   - Avisos: al autor de la publicación y al de la respuesta que contestan.
5. **Reseñas de la plataforma:** una por usuario, editable; no se publican hasta que el admin las
   publica. Editar una publicada la vuelve a dejar sin publicar.
6. **Baja de cuenta:** sus publicaciones y respuestas del foro se borran (texto, datos y archivos);
   sus reseñas quedan con el autor como "Usuario eliminado".

**Consecuencias.** Tablas `reviews`, `favorites`, `platform_reviews`, `forum_posts`,
`forum_post_professions`, `forum_post_media`, `forum_replies`, `forum_post_likes` y
`forum_reply_likes`; enums `content_status` y `forum_post_type`; `file_purpose` suma `FORUM_MEDIA`.
El promedio de estrellas se calcula al leer (sin columnas que puedan desfasarse).
