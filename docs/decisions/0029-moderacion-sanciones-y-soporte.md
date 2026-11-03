# ADR 0029 — Moderación, sanciones, soporte y novedades

- **Fecha:** 03/11/2026 · **Estado:** aprobada · **Resuelve:** P-08, C-09, C-29, C-32 (FI §19 a §21)

**Decisión.**

1. **Reportes:** clientes y profesionales reportan perfiles, mensajes, publicaciones y respuestas del
   foro y reseñas, con motivo (discriminación, falta de respeto, acoso, no se presentó o llegó tarde,
   no cumplió lo acordado, fraude, amenazas, contenido ofensivo, spam u otro), explicación y hasta 3
   fotos privadas. Un reporte abierto por persona y contenido. Estados: enviado, en revisión, válido
   o rechazado. El denunciado **nunca** ve quién lo reportó y **solo se entera cuando el admin marca
   el reporte como válido**. Un reporte rechazado no tiene consecuencias.
2. **Strikes y sanciones, siempre manuales (P-08, C-09):** sin umbrales automáticos. El admin asigna
   cada strike con peso de 1 a 3 y decide la sanción: advertencia, suspensión (con o sin fecha de
   fin), baneo o perfil oculto (C-29: la cuenta sigue, el perfil no aparece en el catálogo). Toda
   sanción y strike queda en el historial y auditado. No hay multa ni reincorporación paga (P-07).
3. **Señales de alerta, solo como aviso al admin:** 3 reportes abiertos o válidos contra la misma
   persona; 5 calificaciones seguidas de 1 o 2 estrellas; más de 4 reseñas negativas (1 o 2).
4. **Fin de la suspensión:** si tiene fecha de fin, se levanta sola al llegar (tarea horaria) y
   queda auditado. Sin fecha, sigue hasta que el admin la levante. Lo mismo para el perfil oculto.
5. **Apelaciones:** el usuario apela un strike o una sanción, también suspendido o baneado (ADR 0007).
   El admin acepta (anula el strike o levanta la sanción) o rechaza, con motivo.
6. **Acceso del admin a chats (C-32):** solo desde un reporte de **mensaje** y solo a esa
   conversación, con las versiones originales (ADR 0024). Cada acceso queda auditado.
7. **Soporte:** formulario por categoría (sugerencia, falla, incidencia, reclamo u otro) con una foto,
   desde la app y también público (contacto, 3 por hora por IP). El admin responde en la plataforma y
   por email (cuando haya proveedor de email; mientras tanto queda guardado).
8. **Novedades:** anuncios a todos o por rol, profesión o plan, como notificación; mensajes del admin
   a un usuario.
9. **Panel:** cifras generales, búsqueda de usuarios y ficha completa (sanciones, strikes, reportes,
   pagos).

**Consecuencias.** Tablas `reports`, `report_evidence`, `strikes`, `sanctions`, `appeals`,
`support_tickets`, `support_messages` y `announcements`; 7 enums nuevos y `file_purpose` suma
`EVIDENCE` (privado). Las suspensiones y baneos que ya existían se copian a `sanctions`, y los
endpoints de suspender, banear y restaurar de la etapa 6 escriben y cierran sanciones.
