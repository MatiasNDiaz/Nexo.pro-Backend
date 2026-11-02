# ADR 0009 — Límites de contenido del plan Premium

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** C-05 del plan

**Contexto.** Las fuentes decían "hasta 3 videos" (CF), "2 videos + 4 imágenes" y, en la misma frase, "las 5 imágenes" (FI §30).

**Decisión.** Premium tiene **5 imágenes y 2 videos** (de hasta 15 s cada uno). Es un valor de la tabla `subscription_plans`, configurable por el admin; el código nunca lo repite.

**Consecuencias.** Seed inicial con esos valores. Basic y Medium siguen como en FI §6.3 (5 imágenes; 0 y 1 video).
