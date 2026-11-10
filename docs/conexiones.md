# Conexiones con servicios externos

Qué cuenta crear para cada servicio, qué copiar y dónde pegarlo. El código de todos está listo: solo
faltan las credenciales. Para probar en tu computadora, las variables del backend van en
`.env.development.local` y las del frontend en `.env.development.local` del frontend (los dos archivos
no se suben a GitHub). En producción van en las variables de Railway (backend) y del hosting del
frontend.

**Regla de oro:** las claves secretas no se pegan en un chat, un email ni un documento compartido. Se
pegan directo en el archivo `.env` o en el panel de Railway. Lo que es público (por ejemplo la clave
del sitio de Turnstile o el ID de cliente de Google) sí se puede compartir.

| Servicio             | Para qué                                           | Costo para empezar           | Estado                                    |
| -------------------- | -------------------------------------------------- | ---------------------------- | ----------------------------------------- |
| Resend               | Emails (verificación, contraseña, soporte, avisos) | Gratis hasta 3.000/mes       | Código listo (etapa 16)                   |
| Cloudinary           | Fotos y videos                                     | Gratis hasta 25 créditos/mes | Código listo                              |
| Google Cloud         | Ingresar con Google                                | Gratis                       | Código listo                              |
| Mercado Pago         | Cobrar los planes                                  | Comisión por venta           | Código listo                              |
| Cloudflare Turnstile | Frenar robots en registro, ingreso y contacto      | Gratis                       | Código listo                              |
| Sentry               | Avisos de errores en producción                    | Gratis (plan Developer)      | Código listo                              |
| Avisos push (VAPID)  | Notificaciones al celular                          | Gratis                       | **Hecho en local** (claves de desarrollo) |

---

## 1. Resend (emails) — lo más urgente

Sin esto no llega ningún email (H-03): ni la verificación de cuenta ni las respuestas de soporte.

1. Creá la cuenta en resend.com.
2. **Domains → Add domain**: el dominio del sitio (por ejemplo `reparaya.com.ar`). Resend te da unos
   registros DNS (SPF, DKIM): cargalos donde tengas el dominio (o en Cloudflare). Esperá a que diga
   _Verified_.
3. **API Keys → Create API key** con permiso _Sending access_. Empieza con `re_`.
4. Backend:
   ```
   MAIL_PROVIDER=resend
   RESEND_API_KEY=re_...            # secreta
   MAIL_FROM=Repara Ya <hola@reparaya.com.ar>
   ```
5. Prueba: registrate con un email tuyo y fijate que llegue el enlace de verificación.

Sin dominio propio todavía: Resend solo deja mandar al email con el que creaste la cuenta. Sirve para
probar, no para usuarios reales.

## 2. Cloudinary (fotos y videos)

Hoy las fotos se guardan en la carpeta `.uploads` de tu computadora; en Railway se borrarían en cada
deploy, por eso en producción es obligatorio.

1. Creá la cuenta en cloudinary.com.
2. En el **Dashboard** están los tres datos: _Cloud name_, _API Key_ y _API Secret_.
3. Backend:
   ```
   STORAGE_PROVIDER=cloudinary
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...        # secreta
   ```
4. Prueba: subí una foto de trabajo desde "Mi perfil" y fijate que aparezca en _Media Library_.

Las fotos de demo que ya están en tu disco no se mudan solas: siguen sirviéndose solo mientras uses
`STORAGE_PROVIDER=local`.

## 3. Google (ingresar con Google)

1. console.cloud.google.com → creá un proyecto ("Repara Ya").
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo _Externo_, nombre de la app, email
   de soporte y el dominio. Alcances: `openid`, `email`, `profile`.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
   - _URI de redireccionamiento autorizados_:
     - local: `http://localhost:3001/api/v1/auth/google/callback`
     - producción: `https://<tu-api>/api/v1/auth/google/callback`
4. Backend:
   ```
   GOOGLE_PROVIDER=google
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...         # secreta
   GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback
   ```
5. Frontend: `NEXT_PUBLIC_GOOGLE_LOGIN=true` (muestra el botón).
6. Prueba: "Ingresar con Google" en /ingresar.

Mientras la app esté "en prueba" en Google, solo pueden entrar los emails que agregues como usuarios
de prueba. Para abrirla a todos, Google revisa la pantalla de consentimiento.

## 4. Mercado Pago (cobrar los planes)

1. mercadopago.com.ar/developers → **Tus integraciones → Crear aplicación** (producto: _Checkout Pro_).
2. **Credenciales de prueba**: copiá el _Access Token_ (empieza con `TEST-`). Las de producción, al
   final, cuando todo esté probado.
3. **Webhooks → Configurar notificaciones**: URL `https://<tu-api>/api/v1/webhooks/payments`, evento
   _Pagos_. Copiá la **clave secreta** que te muestra.
4. Backend:
   ```
   PAYMENTS_PROVIDER=mercadopago
   MERCADOPAGO_ACCESS_TOKEN=TEST-...   # secreta
   MERCADOPAGO_WEBHOOK_SECRET=...      # secreta
   API_PUBLIC_URL=https://<tu-api>
   ```
5. Prueba: con un _usuario de prueba comprador_ de Mercado Pago, pagá un plan y fijate que se aplique.

Para probarlo en tu computadora, Mercado Pago tiene que poder llegar a tu backend: hace falta una URL
pública (un túnel de Cloudflare o ngrok apuntando al 3001). Es más simple probarlo directo en Railway.

## 5. Cloudflare Turnstile (anti-robots)

1. dash.cloudflare.com → **Turnstile → Add widget**. Dominios: `localhost` y el del sitio.
2. Te da dos claves: _Site Key_ (pública) y _Secret Key_ (secreta).
3. Backend: `TURNSTILE_SECRET_KEY=...`
4. Frontend: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=...`
5. Prueba: el formulario de contacto muestra la verificación.

## 6. Sentry (errores en producción)

1. sentry.io → crear proyecto **Node.js** ("nexo-backend").
2. Copiá el _DSN_.
3. Backend: `SENTRY_DSN=https://...@....ingest.sentry.io/...`
4. Solo tiene sentido en producción (en local los errores se ven en la terminal).

## 7. Avisos push (ya hecho en local)

En tu `.env.development.local` del backend ya están `PUSH_PROVIDER=webpush` y unas claves VAPID **de
desarrollo**. Para producción se generan otras con `npm run push:keys` y se cargan en Railway
(`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` —secreta—, `VAPID_SUBJECT=mailto:soporte@<tu-dominio>`).
Cambiar las claves corta las suscripciones existentes: se generan una sola vez por ambiente.

---

## Lo que no necesita cuenta y es decisión tuya

- `PASSWORD_BREACH_CHECK=true`: rechaza contraseñas que aparecieron en filtraciones (Have I Been
  Pwned, sin mandar la contraseña). Apagado por decisión de la etapa 12.
- `CLOUDFLARE_EDGE_SECRET`: solo cuando la API esté detrás de Cloudflare (ver `docs/operacion.md`).
