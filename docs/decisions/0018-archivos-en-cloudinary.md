# ADR 0018 — Archivos en Cloudinary

- **Fecha:** 02/11/2026 · **Estado:** aprobada (pesos confirmados el 02/11/2026)

**Decisión.** Las imágenes y los videos se guardan en **Cloudinary**. El navegador sube directo a
Cloudinary con una firma de vida corta que emite la API; después la API confirma la subida
consultando a Cloudinary el tipo, el peso y la duración reales, y los valida contra los límites.
Videos de **hasta 15 segundos** siempre. Los pesos máximos son **por plan** y configurables
(Premium admite archivos más pesados).

| Archivo                       | Basic / Medium / prueba | Premium |
| ----------------------------- | ----------------------- | ------- |
| Imagen del perfil profesional | 5 MB                    | 10 MB   |
| Video del perfil profesional  | 30 MB                   | 50 MB   |
| Foto de perfil (avatar)       | 5 MB                    | 5 MB    |
| Certificado                   | 5 MB                    | 5 MB    |

**Consecuencias.**

- Interfaz `StorageProvider` con adaptador de Cloudinary y uno local (disco) para desarrollo y
  tests. El local está prohibido en producción. Credenciales solo en variables de entorno.
- Tipos admitidos según el contenido real (no la extensión): JPG, PNG y WebP; MP4 y MOV.
- La firma de Cloudinary cubre el `public_id`, los formatos y `overwrite=false`: el mismo ticket no
  sirve para pisar un archivo ya validado.
- Etapa 7.1: tabla `stored_files` y foto de perfil. Etapa 7.2: medios, certificados y pesos por plan.
