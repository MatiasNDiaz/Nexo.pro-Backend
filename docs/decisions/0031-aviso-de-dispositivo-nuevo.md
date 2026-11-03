# ADR 0031 — Aviso por email de inicio de sesión desde un dispositivo nuevo

- **Fecha:** 03/11/2026 · **Estado:** aprobada (implementación en la etapa 13.2)

**Decisión.**

1. **Cuándo:** al iniciar sesión (contraseña, Google o MFA) desde un dispositivo que la cuenta no
   usó antes. No se manda en el primer inicio de sesión de la cuenta.
2. **Cómo se reconoce el dispositivo:** una cookie propia `nx_device` (prefijo del ADR 0008) con un valor al azar
   (httpOnly, `Secure`, `SameSite=Lax`, 400 días). En la sesión se guarda solo su hash
   (`auth_sessions.device_hash`). Un dispositivo es nuevo si llega sin la cookie o con una que esa
   cuenta no tiene en sus sesiones guardadas. No se usa navegador + IP: un atacante con el mismo
   navegador pasaría inadvertido y la IP del celular cambia todo el tiempo. Si la persona borra las
   cookies, recibe el aviso de nuevo (como en Google).
3. **Contenido:** fecha y hora (Córdoba), navegador y sistema ("Chrome en Windows", leído del user
   agent con una función propia, sin dependencia) y ciudad aproximada si está disponible, más un
   botón "No fui yo, cerrar esa sesión".
4. **Ciudad aproximada: Cloudflare**, con el encabezado de ubicación del visitante. La API solo lo
   cree si además llega un encabezado secreto que agrega Cloudflare (cualquiera puede inventar el de
   la ciudad). Va detrás de una interfaz con un adaptador falso; sin Cloudflare configurado, el email
   dice "ubicación no disponible". La precisión es aproximada (con datos móviles suele ser la ciudad
   del operador).
5. **La ciudad no se guarda:** se calcula, va en el email y se descarta. No aparece en "mis
   sesiones".
6. **Cerrar la sesión desde el email:** token firmado (sesión, cuenta y vencimiento de 7 días), sin
   tabla nueva. El enlace abre una página del frontend con un botón; el cierre lo hace un `POST`
   (los servicios de email abren los enlaces para revisarlos y no deben cerrar nada). La ruta es
   pública, controla el Origin, tiene límite por IP y queda auditada. Después se sugiere cambiar la
   contraseña.

**Consecuencias.** Una columna `auth_sessions.device_hash char(64) NULL`. Se reusa el motivo de
cierre `SESSION_CLOSED`. La cookie `nx_device` es estrictamente necesaria por seguridad: va en la
política de privacidad (revisión legal).
