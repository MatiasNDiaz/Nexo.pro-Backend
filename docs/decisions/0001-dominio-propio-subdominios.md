# ADR 0001 — Dominio propio con subdominios

- **Fecha:** 02/11/2026 · **Estado:** aprobada · **Resuelve:** P-01 del plan

**Contexto.** La autenticación usa cookies `HttpOnly`. Con `*.vercel.app` y `*.up.railway.app` el frontend y el backend son sitios distintos y las cookies requieren `SameSite=None`.

**Decisión.** Habrá dominio propio: frontend en `app.<dominio>` (Vercel) y API en `api.<dominio>` (Railway). El dominio exacto se configura por variables de entorno.

**Consecuencias.** Cookies host-only de la API, `SameSite=Lax`, prefijos `__Host-`/`__Secure-` en producción, CORS con allowlist exacta (plan §9).
