# ADR 0037 — Catálogo de clientes para profesionales

- **Fecha:** 11/11/2026 · **Estado:** pedida por el fundador e implementada (etapa 20) · **Amplía:** FI §13 (foro) y la sección "Clientes" del frontend

**Contexto.** El fundador pidió que en "Clientes" cualquier profesional vea un catálogo de los
clientes y, al tocar uno, sus consultas y pedidos ("Solicito profesional") del foro, para encontrar
clientes potenciales. Se le consultó qué clientes aparecen, qué datos y quién entra.

**Decisión (respuestas del fundador del 11/11/2026).**

1. **Quiénes aparecen: todos los clientes**, publiquen o no en el foro. Solo cuentas `CUSTOMER` con
   el estado `ACTIVE` y sin anonimizar: no aparecen las cuentas por activar, suspendidas, bloqueadas
   ni dadas de baja (criterio de Claude para cuidar los datos; el fundador lo puede cambiar).
2. **Qué datos: lo mismo que ya muestra el foro** (nombre y apellido, foto y fecha de registro) más un
   resumen de **sus publicaciones visibles**: cantidad, "Solicito profesional" sin resolver, la más
   reciente, y los oficios y las localidades de esas publicaciones. **Nunca** teléfono, email ni el
   barrio o la localidad de la cuenta.
3. **Quién entra: cualquier profesional con sesión**, con la cuenta activa o por activar, tenga plan
   o no. Para responder en el foro sigue haciendo falta el plan vigente (regla del ADR 0028).
4. **Rutas:** `GET /customers` (búsqueda por nombre, oficio, localidad y "con solicitudes abiertas";
   primero los que publicaron hace menos; 24 por página, hasta 48) y `GET /customers/:userId` (404
   `CUSTOMER_NOT_FOUND` si no está en el catálogo). Las publicaciones de un cliente se piden al foro:
   `GET /forum/posts?authorId=` (nuevo filtro de la lectura pública, que ya mostraba al autor).
5. **Contra la copia masiva:** 60 pedidos por minuto por profesional en estas rutas.
6. **Sin cambios en la base:** se calcula con las tablas del foro y de usuarios.

**Consecuencias y riesgo.** Mostrar a clientes que nunca publicaron expone su nombre y su foto a
profesionales aunque no lo hayan pedido. Antes de producción, los términos y la política de
privacidad tienen que decirlo (anotado en `pendientes.md`). Si hiciera falta, se puede agregar una
opción "no aparecer en Clientes" en la cuenta (eso sí requiere una columna nueva y aprobación).
