# ADR 0035 — Email transaccional con Resend

- **Fecha:** 10/11/2026 · **Estado:** implementada (etapa 16), a confirmar por el fundador al crear la cuenta · **Resuelve:** H-03 (no había proveedor real de email)

**Contexto.** El backend solo tenía proveedores de desarrollo (`console` y `memory`): en producción no
salía ningún email (verificación de cuenta, enlaces de contraseña, avisos de dispositivo nuevo, fin de
la prueba, respuestas de soporte). La validación del entorno ya impedía arrancar en producción así.

**Decisión.**

1. **Proveedor:** Resend, por su API simple (un POST, sin dependencias nuevas), el plan gratis (3.000
   emails por mes, 100 por día) y la verificación de dominio con SPF y DKIM. Cambiarlo es escribir otro
   adaptador de `MailProvider`; nada más depende del proveedor.
2. **Configuración:** `MAIL_PROVIDER=resend`, `RESEND_API_KEY` (secreta, `re_…`) y `MAIL_FROM` con un
   email del dominio verificado (por ejemplo `Repara Ya <hola@reparaya.com.ar>`). La validación del
   entorno exige las dos y rechaza un remitente `@localhost`.
3. **Seguridad:** el adaptador nunca escribe el contenido en los logs (los emails llevan enlaces con
   tokens). Si falla, el error dice solo el estado HTTP y el nombre del error de Resend. Tiempo límite de
   10 s. Quien envía ya atrapa el error y lo registra sin cortar el pedido (un email que no sale no
   rompe un registro ni un pago).
4. **Pendiente:** los textos de los emails dicen "Nexo PRO"; se cambian a "Repara Ya" con los textos
   definitivos (etapa 8 del frontend).
