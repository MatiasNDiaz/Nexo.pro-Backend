# ADR 0032 — Notificaciones push web

- **Fecha:** 03/11/2026 · **Estado:** aprobada e implementada (etapa 13.3) · **Resuelve:** parte de P-15

**Decisión.**

1. **Push web estándar** (Web Push con claves VAPID) con la librería `web-push` 3.6.7 (MPL-2.0),
   sin cuentas externas ni costo. El frontend es web: en Android y en la PC funciona desde el
   navegador; en el iPhone, solo si la persona agrega el sitio a la pantalla de inicio (iOS 16.4+).
2. **Qué se manda:** cada notificación que se crea en la plataforma sale también por push, después
   del commit y sin demorar a quien la generó. **Mismo título y texto que en la plataforma; nunca el
   contenido de un mensaje de chat** (el aviso dice "Un cliente te escribió").
3. **Cuándo no:** si la persona tiene la app abierta (conectada por tiempo real), o apagó esa
   categoría. Solo a navegadores cuyo dispositivo tiene una sesión abierta: al cerrar sesión deja de
   recibir.
4. **Categorías** (preferencias por push, todas se pueden apagar; en la plataforma siguen llegando):
   mensajes; solicitudes y contrataciones; cuenta (plan, moderación, apelaciones, soporte, mensajes
   del admin); comunidad (reseñas, foro); favoritos (profesional disponible); novedades (activadas
   por defecto); alertas del admin (pagos, moderación, seguridad), solo para el admin.
5. **Seguridad:** solo se aceptan suscripciones de los servicios de push de los navegadores (Google,
   Mozilla, Apple, Microsoft): si la API aceptara cualquier URL, un usuario podría hacerla pedir
   direcciones internas. Hasta 10 navegadores por cuenta y 10 altas por minuto por IP. El aviso viaja
   cifrado de punta a punta; el endpoint no se escribe en los logs.
6. **Fallas:** si el servicio de push dice que la suscripción ya no existe (404/410), se borra; con
   otras fallas, se borra a las 5 seguidas. La limpieza diaria borra las de dispositivos sin sesión.

**Consecuencias.** Tablas `push_subscriptions` (atada a la cuenta y a la familia de sesión) y
`notification_preferences` (sin fila, push activado), enum `notification_category`. Variables
`PUSH_PROVIDER`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secreta) y `VAPID_SUBJECT`; sin ellas el
push queda apagado. Las claves se generan con `npm run push:keys`; cambiar la privada invalida todas
las suscripciones. Una sola instancia: los envíos se hacen en el proceso, por tandas de 10. WhatsApp
y email por categoría quedan para después del lanzamiento.
