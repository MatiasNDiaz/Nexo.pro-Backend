# ADR 0018 — Archivos en Cloudinary

- **Fecha:** 02/11/2026 · **Estado:** aprobada

**Decisión.** Las imágenes y los videos se guardan en **Cloudinary**. El navegador sube directo a
Cloudinary con una firma de vida corta que emite la API; después la API confirma la subida
consultando a Cloudinary el tipo, el peso y la duración reales, y los valida contra los límites.
Videos de **hasta 15 segundos** siempre. Los pesos máximos son **por plan** y configurables
(Premium admite archivos más pesados). Valores propuestos en `pendientes.md`, a confirmar.

**Consecuencias.** Interfaz `StorageProvider` con adaptador de Cloudinary y uno local para desarrollo
y tests. Credenciales de Cloudinary solo en variables de entorno. Detalle en la etapa 7.
