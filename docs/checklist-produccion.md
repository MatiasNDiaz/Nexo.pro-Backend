# Checklist para salir a producción

Lista ordenada de lo que falta, armada el 03/11/2026 a partir de
[`decisions/pendientes.md`](decisions/pendientes.md) (que sigue siendo la lista viva de decisiones).
Pasos técnicos de cada punto: [`operacion.md`](operacion.md). Variables: [`env.md`](env.md).

**Quién:** **Fundador** (cuentas, credenciales, datos del negocio, decisiones) · **Claude** (código
y documentación de este repositorio) · **Abogado** · **Contador** · **Frontend** (el otro
repositorio) · **Juntos** (lo configura el fundador y lo verifica Claude).

**Regla para todas las cuentas:** 2FA activado (GitHub, Railway, Vercel, Cloudflare, Sentry, email,
Cloudinary, Mercado Pago, Google y el registrador del dominio). Las credenciales se cargan en
Railway, nunca en el chat ni en el repositorio.

---

## Fase 0 — Arrancar ya (son los trámites más largos)

- [ ] **Fundador + Abogado — Términos y condiciones y política de privacidad.** Que incluyan:
  - cambio de rol: el período pago sigue corriendo y no se reintegra (ADR 0012);
  - baja de cuenta: 30 días de gracia y después anonimización; qué se conserva y por cuánto (ADR 0013 y 0016);
  - retención de chats (P-05, hoy no se borran);
  - acceso del admin a un chat solo desde un reporte de mensaje (C-32, ADR 0029);
  - cookies, incluida `nx_device` (estrictamente necesaria, ADR 0031);
  - plan de aviso ante una filtración de datos: a quién y en qué plazo (`operacion.md` §8);
  - si corresponde inscribir las bases de datos ante la autoridad de datos personales.
- [ ] **Fundador + Contador — Facturación (AFIP).** Definir:
  - categoría (monotributo o responsable inscripto), tipo de factura y punto de venta electrónico;
  - si se factura desde un facturador externo, desde Mercado Pago o a mano;
  - en qué momento se emite (al aprobarse el pago, mensual, etc.).

  Con eso, Claude propone el diseño (y los cambios en la base, si hacen falta) antes de programar.

- [ ] **Fundador — Dominio y marca definitiva (P-13).** El nombre define el dominio, los textos de
      los emails y el prefijo de las cookies (`nx_`). Cambiarlo después del lanzamiento obliga a todos a
      volver a iniciar sesión.
- [ ] **Fundador — Trámite con Meta para WhatsApp** (se usa después del lanzamiento, pero tarda):
      verificación del negocio, número dedicado y plantillas.
- [ ] **Fundador + Abogado — Revisión legal de la biometría** (identidad automática, después del
      lanzamiento).

## Fase 1 — Cuentas y datos del negocio (Fundador)

En este orden, porque cada una necesita la anterior:

1. [ ] **Dominio** comprado y con su DNS en **Cloudflare**.
2. [ ] **Railway:** dos proyectos, **staging** y **producción**, cada uno con PostgreSQL 17 sin
       acceso público (`operacion.md` §1 y §2).
3. [ ] **Vercel** para el frontend (staging y producción).
4. [ ] **GitHub:** proteger `main` (PR obligatorio y CI en verde), secret scanning y push protection
       (`operacion.md` §9).
5. [ ] **Resend** (elegido, ADR 0035): cuenta, dominio verificado con SPF y DKIM, y la clave de la
       API. **Sin esto la API no arranca en producción.** En pausa hasta tener el dominio (10/11/2026).
6. [ ] **Cloudinary:** cuenta propia y clave de desarrollo **hechas** (10/11/2026). Falta activar
       _Allow delivery of PDF and ZIP files_ (para los certificados) y la clave `repara-ya-prod`.
7. [ ] **Mercado Pago:** primero las credenciales **de prueba** (para staging) y después las
       **productivas**: access token y clave de webhooks.
8. [ ] **Google Cloud:** proyecto, pantalla de consentimiento y cliente de desarrollo **hechos**
       (10/11/2026). Faltan los clientes de staging y producción con sus URLs `https` (ADR 0023).
9. [ ] **Cloudflare:** Turnstile (site key y secreto), **Tunnel** para la API y **R2** para el backup
       propio (bucket privado con regla de 30 días y un token solo para ese bucket).
10. [ ] **Sentry** (proyecto Node.js, `SENTRY_DSN`, alerta por email) y **UptimeRobot** o Better
        Stack (monitor de `/api/v1/health/ready` cada minuto, aviso al celular).
11. [ ] **Datos del negocio:**
    - localidades que se habilitan (hoy solo Córdoba capital);
    - catálogo definitivo de oficios (hoy hay 10 de ejemplo);
    - precios vigentes de los planes ($10.000 / $15.000 / $20.000).

## Fase 2 — Código que falta (Claude)

Cada punto sigue el flujo de siempre: diseño y cambios en la base antes de crear nada, rama propia,
tests, CI y tu aprobación.

1. [x] **Adaptador del proveedor de email:** Resend, sin dependencias nuevas (ADR 0035, etapa 16).
2. [ ] **Rechazo de requests sin `x-nexo-edge-secret`** cuando `CLOUDFLARE_EDGE_SECRET` está
       configurado (salvo `/health/live`), para que solo se entre por Cloudflare. **Bloquea el
       lanzamiento.**
3. [ ] **Facturación AFIP**, según lo que definan el fundador y el contador en la Fase 0. **Bloquea
       cobrar en producción.**
4. [ ] **Carga de los datos del negocio** (localidades, oficios, precios) en la base.
5. [ ] **Actualizar la revisión de seguridad** (`revision-seguridad.md`) con la etapa 13: el aviso
       de dispositivo nuevo ya está, push, ingresos y métricas.
6. [ ] **Decisión del fundador antes de programar — Cambio de email** (confirmación al nuevo y aviso
       al viejo). Hoy no se puede cambiar el email. Recomendado antes del lanzamiento: si alguien pierde
       el acceso a su email, hoy solo lo resuelve el admin.

## Fase 3 — Frontend (otro repositorio)

- [x] **Frontend — Páginas que enlazan los emails** (`/verificar-email`, `/restablecer-contrasena`,
      `/vincular-google`, `/ingresar/google`, `/suscripcion/resultado`, `/cerrar-sesion`).
- [x] **Frontend — Push:** service worker y pedido de permiso (probado en local).
- [x] **Frontend — Turnstile:** el widget en el registro, el contacto y el login (falta la cuenta de
      Cloudflare para encenderlo).
- [ ] **Frontend — Etapa 8 (cierre):** CSP con nonce, accesibilidad, Lighthouse y textos legales
      definitivos.

## Fase 4 — Staging: probar todo con cuentas reales (Juntos)

1. [ ] Deploy de staging con sus propias claves (`operacion.md` §2), las migraciones y el seed.
2. [ ] **Cloudflare Tunnel** sin dominio público en Railway; fijar `TRUST_PROXY` comprobando que el
       límite por IP y la auditoría vean la IP real del visitante (`operacion.md` §2).
3. [ ] **Checkout real** con el sandbox de Mercado Pago: pagar, renovar, mejorar de plan, reembolsar.
       Verificar el webhook y el panel de ingresos.
4. [ ] Login con Google, emails reales (verificación, recuperación, dispositivo nuevo con la ciudad),
       push en Android, PC e iPhone, y Turnstile.
5. [ ] **Backups:** activar los de Railway y el propio en R2, y **repetir la prueba de restauración**
       (`operacion.md` §4).
6. [ ] Prueba de carga (`ops/load`) y revisar Sentry y el monitor de uptime.
7. [ ] Activar `PASSWORD_BREACH_CHECK=true`.

## Fase 5 — Producción (Juntos)

1. [ ] Claves propias de producción, **distintas de las de staging**: JWT, CSRF, cifrado, HMAC,
       VAPID (`npm run push:keys`, una sola vez) y secreto de Cloudflare.
2. [ ] Credenciales productivas de Mercado Pago, Google, Cloudinary y email cargadas en Railway.
3. [ ] Deploy, migraciones como paso previo y seed una sola vez.
4. [ ] Crear el admin (`admin:create`), guardar los códigos de recuperación fuera de línea y probar el
       segundo factor.
5. [ ] Verificar `health/ready`, el monitor, Sentry, el backup del día y un recorrido completo:
       registro, verificación, catálogo, chat, pedido y pago real de prueba con reembolso.
6. [ ] Publicar los términos y la política de privacidad aprobados por el abogado.

## Después del lanzamiento (ya decidido)

- WhatsApp (con las plantillas aprobadas por Meta), chatbot y agenda Premium (las citas llegan por la
  plataforma, email y WhatsApp), identidad automática (con la revisión legal y tu aprobación expresa).
- Comisión de Mercado Pago y reembolsos parciales en el panel de ingresos.
- Redis, solo si hace falta más de una instancia.
- Seguimiento de los 5 avisos moderados de `npm audit` (Sentry): Dependabot trae la actualización.

## Decisiones de producto abiertas (no bloquean el lanzamiento)

Hoy funcionan con una solución provisoria (detalle en `pendientes.md`):

- pesos definitivos del ranking (P-10);
- etiqueta "Recomendado" de Premium (sin modelar);
- clasificación de clientes (C-07);
- qué cambia según la urgencia del pedido;
- aviso de disponibilidad por horario;
- avisos al admin por cada registro y por cada verificación pendiente;
- "en línea" y "escribiendo…" en el chat;
- foro vinculado a una contratación (C-28);
- cuentas nuevas después de un baneo.
