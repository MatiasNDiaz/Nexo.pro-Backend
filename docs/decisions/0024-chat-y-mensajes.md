# ADR 0024 — Chat y mensajes

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** C-10, C-13, C-14, P-05 (provisorio), FI §12

**Decisión.**

1. **Tiempo real con Socket.IO dentro de la misma API** (`socket.io` 4.8.4, `@nestjs/websockets` y
   `@nestjs/platform-socket.io` 12.3.2). La conexión usa la cookie de sesión y valida el origen. Los
   mensajes se envían por la API REST; Socket.IO solo avisa (`message:new`, `message:updated`,
   `conversation:read`, `notification:new`).
2. **Un chat por pareja cliente-profesional.** Solo el cliente inicia, solo con cuenta activa y solo a
   profesionales visibles en el catálogo.
3. **Profesional sin prueba ni plan vigente:** no usa el chat ni ve conversaciones; el cliente puede
   leer el historial pero no mandar mensajes nuevos (C-12).
4. **Qué ve el profesional del cliente (C-13):** desde que el cliente le escribe, nombre, foto, barrio
   y "datos útiles". La dirección se acuerda por el chat (no hay campo de dirección).
5. **Editar:** solo durante los **15 minutos** siguientes al envío; queda marcado como editado.
   **Eliminar:** siempre; el mensaje se oculta para los dos.
6. **Versión original:** la primera edición o la eliminación guarda el texto original en
   `messages.original_body`, que nunca cambia después. Es **visible solo para el admin y solo ante un
   reporte** (el acceso llega con los reportes, etapa 11).
7. **Los chats no se borran** (sin tarea mensual) hasta la revisión legal (C-10, P-05).
8. Adjuntos: imágenes y videos (los documentos, como imagen), **privados**: solo los ven los dos
   participantes, con un enlace de vida corta. Pesos de Basic: imagen 5 MB, video 30 MB y ≤ 15 s.
9. Notificaciones solo dentro de la app (P-15). "En línea" y "escribiendo…" quedan para más adelante;
   sí hay confirmación de lectura.
10. Límite: 30 mensajes por minuto por usuario.

**Consecuencias.** Con más de una instancia de la API hace falta el adaptador de Redis de Socket.IO
(etapa 12). Al anonimizar una cuenta, sus archivos (también los adjuntos) se borran del proveedor.
