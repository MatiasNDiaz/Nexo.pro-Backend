# ADR 0017 — Prueba gratuita de 30 días

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** C-23

**Decisión.** La prueba del profesional **empieza al registrarse** y dura 30 días corridos, complete o
no su perfil: si tarda en cargar sus datos, esos días se pierden. No hay ninguna otra regla para
"perder la prueba". El profesional ve un **contador de días restantes** y recibe **recordatorios**
antes de que termine. Durante la prueba rigen los **límites del plan Basic** (confirmado el 02/11/2026).

**Consecuencias.**

- `subscriptions` con estado `TRIAL` y `trial_ends_at = fecha de registro + 30 días` (etapa 7).
- El contador sale de `GET /subscriptions/me` (etapa 7). Los recordatorios usan las notificaciones
  internas (etapa 8) y el email (con proveedor real). Días de aviso propuestos: 7, 3 y 1.
- Al terminar la prueba sin plan pago, el perfil se oculta y no se borra nada (FI §6.2).
- Riesgo a tener en cuenta: el tiempo que tarde la verificación de identidad también corre dentro de
  la prueba.
