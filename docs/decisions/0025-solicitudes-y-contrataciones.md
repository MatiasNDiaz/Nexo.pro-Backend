# ADR 0025 — Solicitudes y contrataciones

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** P-04, C-11, C-30 (a partir del FI §11.3)

**Decisión.** El FI §11.3 se separa en dos máquinas de estados:

- **Negociación con cada profesional** (`service_request_targets`): `PENDING` → `IN_DISCUSSION` (el
  profesional responde) → `QUOTED` (manda presupuesto; corregirlo reemplaza al anterior) → `SELECTED`
  (el cliente lo elige). También `DECLINED` (el profesional no lo toma), `CANCELLED` (el cliente
  cancela el pedido) y `NOT_SELECTED` (el cliente eligió a otro).
- **Contratación** (`service_contracts`, una por pedido): `ACCEPTED` → `SCHEDULED` → `IN_PROGRESS` →
  `COMPLETED`, con `CANCELLED_BY_CLIENT` y `CANCELLED_BY_PRO` desde cualquier estado no terminal.

Reglas (FI §11): solo el profesional avanza la contratación; el cliente elige y puede cancelar. No
hace falta confirmación del cliente para terminar. Repetir un trabajo es una contratación nueva.
Justificación de cancelación opcional. Al elegir, los demás profesionales quedan `NOT_SELECTED` y
reciben "El cliente {nombre} ya seleccionó a un profesional"; sus chats siguen activos. Cancelar antes
de cualquier respuesta deja "Ya lo solucioné, disculpas por la molestia". Cualquier otra transición
responde 409 (tabla de transiciones en el código, con el actor permitido).

- **C-11:** se guardan solo las transiciones de la contratación (`service_contract_history`).
- **C-30:** el estado de atención no cambia solo; al empezar un trabajo la API sugiere "Trabajando".
- `REPORTED` / `UNDER_REVIEW` llegan con los reportes (etapa 11).
