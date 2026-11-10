# ADR 0036 — Cloudinary: carpeta por ambiente y archivos de varios proveedores

- **Fecha:** 10/11/2026 · **Estado:** implementada (etapa 17) · **Amplía:** ADR 0018

**Contexto.** Al principio se pensó en usar la cuenta de Cloudinary de otro proyecto del fundador
(CercaTrova). Como el plan gratis permite un solo _product environment_ y una clave de esa cuenta
habría podido tocar archivos de CercaTrova, **Repara Ya tiene su propia cuenta de Cloudinary**,
totalmente separada (otro correo, otro cloud name, sus propias claves). Además, al pasar el entorno
local de disco a Cloudinary, todos los archivos ya guardados en disco dejaban de verse: el backend
armaba la dirección de cada archivo con el proveedor activo, aunque cada fila guarda en cuál se subió
(`stored_files.provider`).

**Decisión.**

1. **Carpeta propia por ambiente** (`CLOUDINARY_FOLDER`): `repara-ya/dev` en desarrollo (valor por
   defecto) y `repara-ya/prod` en producción. Se admiten subcarpetas (`a/b`), solo minúsculas, números,
   guiones y `/`. En producción la validación rechaza una carpeta de desarrollo o de pruebas (que
   termine en `dev` o `test`).
2. **Lo que separa desarrollo de producción dentro de la cuenta:** el backend solo consulta, mueve
   (público ↔ privado) o borra archivos por su `public_id` exacto, que sale de su propia base. Nunca
   lista ni borra por carpeta o por prefijo. Por eso las pruebas locales no pueden tocar archivos de
   `repara-ya/prod`.
3. **Claves propias por ambiente** ("repara-ya-dev", "repara-ya-prod"), con rol Master Admin: como la
   cuenta es solo de Repara Ya, ese rol no alcanza a ningún otro proyecto. `npm run check:cloudinary`
   verifica que la clave pueda hacer todo lo que hace el backend.
4. **Registro de proveedores:** los archivos nuevos van al proveedor activo; cada archivo existente se
   atiende con el de su fila. Fuera de producción el disco queda disponible para los archivos que ya
   están ahí; Cloudinary, si tiene credenciales. En producción no hay disco: un archivo de disco no se
   sirve.

**Consecuencias.** Pasar el entorno local a Cloudinary no rompe las fotos de demo. No cambia la base de
datos (la columna `provider` ya existía). La cuota del plan gratis de la cuenta la comparten
desarrollo y producción: conviene borrar de vez en cuando lo que quede en `repara-ya/dev`.
