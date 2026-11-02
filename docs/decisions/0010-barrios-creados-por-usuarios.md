# ADR 0010 — Barrios creados por los usuarios y zonas de trabajo

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Reemplaza:** la lista de barrios del seed (etapa 4)

**Contexto.** No hay una fuente oficial de barrios y una lista cerrada impediría registrarse a quien
viva en un barrio no cargado.

**Decisión.**

- No hay lista predefinida: los barrios se crean cuando los usuarios los escriben (eligiendo uno
  existente con autocompletado o escribiendo uno nuevo).
- Se comparan **normalizados** (minúsculas, sin tildes ni puntuación, espacios simples) para no
  duplicar. Un barrio nuevo queda `PENDING`: se puede usar, pero no aparece en el autocompletado ni en
  los filtros públicos hasta que el admin lo apruebe.
- El admin puede aprobar, renombrar o fusionar (etapa 7), todo auditado. Un barrio fusionado queda
  como **alias** del destino: si alguien vuelve a escribirlo, se resuelve al destino.
- **Cliente**: indica el barrio donde vive (obligatorio).
- **Profesional**: no indica dónde vive; indica **dónde trabaja**: de 1 a 20 zonas (configurable,
  `MAX_SERVICE_AREAS`). Una zona es un barrio o **toda una localidad**; si elige toda la localidad,
  los barrios sueltos de esa misma localidad se descartan.
- Los barrios pendientes no se muestran en el perfil público (propuesta aplicada; se puede cambiar).

**Consecuencias.** `neighborhoods` con `normalized_name` único por localidad, `status`
(`PENDING`/`APPROVED`/`MERGED`), `merged_into_id`, `created_by_user_id`, `reviewed_by_id`.
`users.neighborhood_id` obligatorio solo para clientes. `professional_service_areas` con FK compuesta
barrio↔localidad e índice único `NULLS NOT DISTINCT`. El seed ya no carga barrios.
