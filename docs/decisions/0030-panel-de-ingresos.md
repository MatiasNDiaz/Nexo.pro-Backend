# ADR 0030 — Panel de ingresos del admin

- **Fecha:** 03/11/2026 · **Estado:** aprobada · **Etapa:** 13.1

**Decisión.**

1. **Solo el admin.** Tres vistas: lista de pagos, lista de registros y resumen de lo cobrado. Todo
   en hora de Córdoba (UTC−3); las semanas van de lunes a domingo.
2. **Lista de pagos:** quién pagó (nombre, email, rol y localidades), plan (y el anterior si el pago
   lo cambió), monto, fecha y hora, tipo y estado. Sin filtro de estado muestra los que movieron
   plata: aprobados, reembolsados y contracargos. La fecha es la de aprobación; para los que nunca se
   aprobaron (filtrando por estado), la de creación.
3. **Tipos de pago**, fijados al aplicarse el pago:
   - **Nuevo:** primer pago de la cuenta (sin otro anterior que siga en pie).
   - **Renovación:** el mes siguiente, pagado con el período todavía vigente.
   - **Reactivación:** ya había pagado, se le venció y volvió a pagar.
   - **Mejora de plan:** la diferencia para subir de plan (C-24).

   Un pago aprobado que no se aplicó (no coincidió el importe o el plan) queda "sin aplicar".

4. **Neto con criterio de caja:** el cobro suma en la fecha en que se aprobó y el reembolso o
   contracargo resta en la fecha en que se devolvió la plata. Un mes cerrado no cambia después. El
   resumen da, por período (día, semana, mes o año) y por plan, lo cobrado, los reembolsos, los
   contracargos, el neto y la cantidad de cobros.
5. **Período anterior:** el mismo tramo corrido hacia atrás en el calendario. Si el rango empieza un
   día 1 se corre en meses (del 1 al 3 de noviembre contra el 1 al 3 de octubre; un mes completo
   contra el mes anterior completo; un año contra el anterior). Si no, en días (una semana contra la
   anterior). La variación se da en pesos y en porcentaje (sin porcentaje si el anterior fue 0).
6. **Localidad:** la de hoy. Clientes: la de su barrio. Profesionales: todas las localidades donde
   trabajan. Al filtrar por localidad, un profesional que trabaja en varias suma en cada una, así
   que los totales de dos localidades pueden contarlo dos veces; el total sin filtro es exacto.
7. **Registros:** quién se registró, cuándo, con qué rol, su localidad, su plan actual y si pagó
   alguna vez (tiene un cobro que no se devolvió; vacío para los clientes que nunca pagaron). El
   admin no aparece. Las cuentas eliminadas se muestran como "Usuario eliminado", sin email.
8. **Exportar a CSV (descarga de datos aprobada expresamente por el fundador):**
   - pagos con nombre y email de quien pagó (para conciliar con Mercado Pago y facturar);
   - registros **sin email**;
   - resumen con totales, período anterior y variación.

   Formato para Excel en español: separador `;`, coma decimal, UTF-8 con BOM. Los textos que
   empiezan con `=`, `+`, `-` o `@` se neutralizan (inyección de fórmulas). Máximo 50.000 filas y 10
   exportaciones por hora. Cada exportación queda auditada (`REVENUE_EXPORTED`) con el reporte, los
   filtros, la cantidad de filas y la IP seudonimizada; sin datos personales. Es `POST` para exigir
   CSRF y Origin como cualquier escritura.

**Límites del número.** Es lo que pagó el profesional, no lo que acredita Mercado Pago (no descuenta
su comisión). No hay reembolsos parciales en el modelo: un reembolso cuenta por el total. No
reemplaza la facturación AFIP (pendiente antes de producción).

**Consecuencias.** Enum `payment_kind` y columnas `payments.kind` (solo en pagos aplicados) y
`payments.money_returned_at` (obligatoria en reembolsados y contracargos); índices parciales por
fecha de aprobación y de devolución y un índice por fecha de registro en `users`. Los pagos que ya
existían se completan con la misma regla. Si un aviso de reembolso llega sin que antes haya llegado
el de aprobado, el pago toma la fecha de aprobación del proveedor: la plata entró antes de salir.
