# ADR 0036 — Cloudinary en una cuenta compartida y archivos de varios proveedores

- **Fecha:** 10/11/2026 · **Estado:** implementada (etapa 17) · **Amplía:** ADR 0018

**Contexto.** El fundador ya tiene una cuenta de Cloudinary que usa otro proyecto (CercaTrova) y
prefiere no crear otra. Además, al pasar el entorno local de disco a Cloudinary, todos los archivos ya
guardados en disco dejaban de verse: el backend armaba la dirección de cada archivo con el proveedor
activo, aunque cada fila guarda en cuál se subió (`stored_files.provider`).

**Decisión.**

1. **Carpeta propia por ambiente** (`CLOUDINARY_FOLDER`): `repara-ya/dev` en desarrollo (valor por
   defecto) y `repara-ya/prod` en producción. Se admiten subcarpetas (`a/b`), solo minúsculas, números,
   guiones y `/`. En producción la validación rechaza una carpeta de desarrollo o de pruebas (que
   termine en `dev` o `test`).
2. **Lo que garantiza la separación:** el backend solo consulta, mueve (público ↔ privado) o borra
   archivos por su `public_id` exacto, que sale de su propia base. Nunca lista ni borra por carpeta o
   por prefijo. Por eso no puede tocar archivos de otro proyecto de la misma cuenta.
3. **Claves propias por ambiente** ("repara-ya-dev", "repara-ya-prod"), revocables sin afectar las del
   otro proyecto. Cloudinary no limita una clave a una carpeta salvo con roles de carpeta (Admin API) o
   planes Enterprise: el rol de la clave se decide con el fundador (ver `docs/conexiones.md`).
4. **Registro de proveedores:** los archivos nuevos van al proveedor activo; cada archivo existente se
   atiende con el de su fila. Fuera de producción el disco queda disponible para los archivos que ya
   están ahí; Cloudinary, si tiene credenciales. En producción no hay disco: un archivo de disco no se
   sirve.

**Consecuencias.** Pasar el entorno local a Cloudinary no rompe las fotos de demo. No cambia la base de
datos (la columna `provider` ya existía). La cuota del plan de Cloudinary es compartida con el otro
proyecto.
