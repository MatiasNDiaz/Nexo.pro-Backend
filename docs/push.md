# Notificaciones push: guía para el frontend

Decisión en [ADR 0032](decisions/0032-notificaciones-push.md). La API manda por push cada notificación
de la plataforma, salvo que la persona tenga la app abierta o haya apagado esa categoría.

## Activar los avisos en un navegador

1. `GET /api/v1/notifications/push/key` → `{ enabled, publicKey }`. Si `enabled` es `false`, no
   ofrecer push.
2. Registrar un service worker (por ejemplo `/sw.js`) y, **después de un clic** de la persona (iOS lo
   exige), pedir permiso: `Notification.requestPermission()`.
3. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })`
   (la clave en base64url se pasa convertida a `Uint8Array`).
4. Mandar `subscription.toJSON()` a `POST /api/v1/notifications/push/subscriptions` (con
   `X-CSRF-Token`): `{ endpoint, keys: { p256dh, auth } }`. Respuesta `204`.
5. Al desactivar: `subscription.unsubscribe()` y `POST /api/v1/notifications/push/subscriptions/remove`
   con `{ endpoint }`.

Volver a suscribir en cada inicio de sesión: la suscripción queda atada al dispositivo de la sesión
y, al cerrar sesión, deja de recibir.

**iPhone y iPad:** el push web solo funciona si el sitio se agregó a la pantalla de inicio (iOS
16.4 o posterior) y se abre desde ahí. Conviene detectarlo (`display-mode: standalone`) y explicar
cómo agregarlo antes de pedir permiso.

## Lo que recibe el service worker

```json
{
  "id": "uuid de la notificación",
  "type": "NEW_MESSAGE",
  "category": "MESSAGES",
  "title": "Mensaje nuevo",
  "body": "Un cliente te escribió.",
  "targetType": "CONVERSATION",
  "targetId": "uuid",
  "tag": "NEW_MESSAGE:uuid"
}
```

Mostrarlo con `self.registration.showNotification(title, { body, tag, data })`: el `tag` hace que
un aviso nuevo del mismo chat reemplace al anterior. Al tocarlo (`notificationclick`), abrir la
pantalla según `targetType` y `targetId` (las mismas reglas que las notificaciones de la plataforma).

## Preferencias

- `GET /api/v1/notifications/preferences` → `[{ category, push }]` (6 categorías; el admin ve solo
  `ADMIN_ALERTS`). Sin cambios, todas en `true`.
- `PUT /api/v1/notifications/preferences` con `{ preferences: [{ category, push }] }`: devuelve la
  lista actualizada. Apagar una categoría solo corta el push: en la plataforma sigue llegando.
