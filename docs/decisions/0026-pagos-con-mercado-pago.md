# ADR 0026 — Pagos con Mercado Pago

- **Fecha:** 03/11/2026 · **Estado:** aprobada · **Resuelve:** C-04, C-24, C-27, FI §6.4

**Decisión.**

1. **Pago manual mensual con el checkout de Mercado Pago.** Sin débito automático, multa ni interés
   (P-06 y P-07 siguen prohibidos sin aprobación). Integración por la API REST con `fetch`, sin el
   SDK; adaptador simulado hasta tener las credenciales de prueba.
2. **Estados de la suscripción:** `TRIAL`, `ACTIVE` y `EXPIRED`. Se sacan `CANCEL_AT_PERIOD_END` y
   `PAST_DUE` (sin débito no hay nada que cancelar ni deuda). `SUSPENDED_BY_ADMIN` nunca existió (C-27).
3. **Cada pago aprobado da 30 días.** Pagar durante la prueba activa el plan en el momento y el período
   termina 30 días después del fin de la prueba (no se pierden días). Renovar: desde 7 días antes del
   vencimiento; el período nuevo empieza al terminar el actual. Con la suscripción vencida, empieza al
   pagar.
4. **Subir de plan (C-24):** dentro de los 10 días del último pago se paga la diferencia (precio nuevo
   menos lo pagado) y el cambio es inmediato. Después, el plan nuevo se elige al pagar el mes
   siguiente.
5. **Bajar de plan:** se elige al pagar el mes siguiente. Al empezar ese período, lo que excede el plan
   pasa a `HIDDEN_BY_PLAN` (lo más reciente primero, sin borrar) y el profesional elige qué mostrar
   dentro del límite.
6. **El admin** cambia el plan de común acuerdo, con motivo y auditoría. No suspende suscripciones.
7. **Control de coincidencia:** antes de aplicar un pago se verifica que el monto, la moneda y el plan
   que informa Mercado Pago coincidan con el pago que creamos. Si no coinciden, **no se aplica**, queda
   auditado (`PAYMENT_MISMATCH`) y se notifica al admin.
8. **Reembolsos y contracargos:** si un pago aprobado pasa a `REFUNDED` o `CHARGED_BACK`, **se revierte**
   el tramo de período o la mejora de plan que dio, queda en el historial de la suscripción y se
   notifica al admin (y al profesional).
9. El webhook solo avisa: se valida la firma (`x-signature`) y el estado real se consulta a Mercado
   Pago. Cada aviso se procesa una sola vez.

**Consecuencias.** `payments` guarda qué dio cada pago (`granted_from`, `granted_until`,
`previous_plan_id`) y cuándo se revirtió (`reverted_at`); `payment_events` guarda los avisos.
`subscriptions` suma `period_amount_paid` y renombra `last_trial_reminder_days` a
`last_reminder_days` (recordatorios de la prueba y del vencimiento).
