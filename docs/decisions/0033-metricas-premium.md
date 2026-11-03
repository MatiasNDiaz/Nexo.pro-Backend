# ADR 0033 — Métricas Premium

- **Fecha:** 03/11/2026 · **Estado:** aprobada e implementada (etapa 13.4) · **Resuelve:** CF §2.2, FI §6.3

**Decisión.**

1. **Qué se mide**, por día, semana o mes en hora de Córdoba y comparado con el mismo tramo del
   período anterior:
   - personas distintas que abrieron el perfil;
   - personas distintas que lo vieron en los resultados del catálogo, y cuántas lo vieron primero en
     la primera página;
   - pedidos que le llegaron, trabajos terminados y reseñas (cantidad y promedio del período, y el
     promedio de todas sus reseñas).
2. **Cómo se cuentan las personas:** distintas por día (recargar no suma). Con sesión, la cuenta;
   sin sesión, la IP seudonimizada con el navegador. La lista de quién ya contó vive solo en memoria
   y se descarta al cambiar el día; **en la base quedan solo los totales**. No cuentan el propio
   profesional, el admin ni los robots. Los contadores se guardan cada minuto (si la app se cae, se
   pierde como mucho un minuto). Una persona que vuelve otro día cuenta de nuevo.
3. **Para quién:** se cuentan para todos los que aparecen en el catálogo; **solo los planes con
   métricas las ven** (hoy, solo Premium; si se activa Medium, se decide entonces). Si vence el
   Premium, los datos se conservan y los vuelve a ver al renovar.
4. **Admin:** las ve en la ficha de cada profesional, de solo lectura.
5. **Retención:** 25 meses (para comparar un mes con el mismo del año anterior); los borra la
   limpieza diaria.

**Consecuencias.** Tabla `professional_metrics_daily` (profesional + día, tres contadores, checks
de valores ≥ 0). Pedidos, trabajos y reseñas salen de sus tablas, sin duplicarlos. Endpoints
`GET /professionals/me/metrics` (403 `PLAN_FEATURE_REQUIRED` sin el plan) y
`GET /admin/users/:id/metrics`. El calendario de períodos se comparte con el panel de ingresos
(`src/common/calendar-periods.ts`). Una sola instancia, como el límite de pedidos y el tiempo real.
