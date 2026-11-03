# ADR 0022 — Orden provisional del catálogo

- **Fecha:** 02/11/2026 · **Estado:** aprobada (provisoria hasta definir P-10 y tener reseñas)

**Decisión.** El catálogo público ordena a los profesionales así:

1. **Plan:** Premium, después Medium, después Basic (la prueba cuenta como Basic). Sale de
   `subscription_plans.ranking_tier`.
2. **Disponibles en ese momento** primero (estado de atención efectivo, con su horario).
3. **Perfiles más completos** primero.
4. A igualdad, el perfil más antiguo primero (orden estable para paginar).

**Perfil completo** suma un punto por cada uno de estos datos opcionales: nombre comercial, años de
experiencia, tarifa de referencia, al menos un medio, al menos un certificado, al menos una red
social y horario cargado.

**Consecuencias.** Las reseñas (etapa 10) y los pesos definitivos del ranking (P-10) van a cambiar
este orden con un ADR nuevo. "Cerca de mí" sigue pendiente (P-11).
