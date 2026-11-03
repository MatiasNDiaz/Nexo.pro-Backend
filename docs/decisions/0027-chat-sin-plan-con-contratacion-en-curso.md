# ADR 0027 — Chat sin plan vigente con una contratación en curso

- **Fecha:** 03/11/2026 · **Estado:** aprobada · **Resuelve:** C-12

**Contexto.** Desde la etapa 8, un profesional sin prueba ni plan vigente no usa el chat y el
cliente puede leer la conversación pero no escribir. Eso deja colgados los trabajos ya acordados si
el profesional no renueva.

**Decisión.**

1. Si el profesional no tiene plan vigente, el chat **sigue habilitado para los dos** solo con un
   cliente con el que tenga una **contratación en curso** (`ACCEPTED`, `SCHEDULED` o `IN_PROGRESS`), y
   hasta que esa contratación se cierre (terminada o cancelada).
2. Sin contratación en curso queda como estaba: el cliente lee pero no escribe y el profesional no
   usa el chat (`SUBSCRIPTION_REQUIRED`).
3. Para poder cerrarla, el profesional sin plan puede ver sus contrataciones en curso y avanzarlas o
   cancelarlas. No puede responder pedidos nuevos, presupuestar ni aparecer en el catálogo.
4. La lista de chats del profesional sin plan muestra solo los de contrataciones en curso.

**Consecuencias.** No cambia la base: se calcula con `service_contracts`. Los demás límites del plan
(contenido, catálogo, pedidos nuevos) siguen igual.
