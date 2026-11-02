# ADR 0020 — Certificados publicados sin aprobación previa

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Reemplaza:** la revisión previa de certificados
  del plan (§8.2.2) y del diagrama de la etapa 7

**Decisión.**

1. Los certificados **se publican apenas el profesional los sube**: sin aprobación previa y sin
   archivo privado.
2. Al subirlo, el profesional **confirma** que el documento no muestra datos sensibles (DNI,
   dirección, fecha de nacimiento) o que los tapó. Sin esa confirmación no se publica. Se guarda la
   fecha de la confirmación.
3. El admin puede **ocultarlo después con motivo**, y queda auditado. Estados: `ACTIVE` y
   `HIDDEN_BY_ADMIN`.
4. En el perfil se muestra como **"certificado cargado por el profesional"**, nunca como
   "verificado". La API lo marca con `verified: false`.
5. Formatos: JPG, PNG, WebP y **PDF**, hasta 5 MB. Máximo **10 certificados** por profesional, en todos
   los planes.

**Consecuencias.** `professional_certifications` sin `reviewed_by` ni estados de revisión; con
`sensitive_data_confirmed_at`, `hidden_by`, `hidden_at` y `hidden_reason`. El riesgo de que se publique
un dato sensible que el profesional no tapó queda mitigado por la confirmación y la posibilidad de
ocultarlo; no hay revisión automática del contenido.
