# ADR 0034 — Estilo por sección de la página del profesional

- **Fecha:** 10/11/2026 · **Estado:** pedida por el fundador e implementada (etapa 14) · **Amplía:** FI §6.3 (personalización aprobada el 02/11/2026)

**Contexto.** Hasta ahora la página del profesional se personalizaba con valores de listas cerradas
(12 colores, degradé entre dos de ellos, 4 tipografías, frase y 4 animaciones del nombre). El
fundador pidió que Medium y Premium puedan elegir, contenedor por contenedor, el color de fondo, el
color de letra, el tamaño y una animación de entrada.

**Decisión.**

1. **Dónde se guarda:** dentro de la columna `professional_profiles.theme` (jsonb) que ya existe, en
   la clave `sections`. **No cambia la estructura de la base** (sin tabla, columna ni migración).
2. **Secciones** (lista cerrada): `pagina`, `presentacion`, `datos`, `sobre`, `trabajos`,
   `certificados`, `resenas`, `contacto`, `zonas`, `horarios`, `redes`. Otra clave responde 400.
3. **Campos de cada sección:**
   - `background` y `text`: colores libres, **solo** en formato `#rrggbb` (se guardan en minúsculas).
   - `backgroundTo`: segundo color; con `background`, el fondo es un degradé.
   - `size`: escala del contenido, de 85 a 125 % de a 5.
   - `animation`: entrada al aparecer en pantalla, una de 6: `aparecer`, `subir`, `costado`, `zoom`,
     `rebote`, `girar`.
4. **Por plan:** Basic nada; **Medium** `background` y `text` (colores sólidos); **Premium** todo.
   Lo que el plan no incluye responde `403 THEME_NOT_IN_PLAN` con la ruta del campo
   (`sections.sobre.animation`) en `details`.
5. **Al bajar de plan** la página pública oculta lo que el plan nuevo no incluye (también dentro de
   cada sección), sin borrarlo: si vuelve a subir, reaparece. Es la misma regla que ya regía para el
   resto del tema.
6. **Seguridad:** sigue sin aceptarse CSS ni HTML del usuario. Un color pasa por una expresión
   regular estricta; el frontend lo pone en atributos `style` de React (que escapan el valor) o en
   variables CSS, nunca concatenado en una hoja de estilos.
7. **Legibilidad:** con colores libres, alguien puede elegir letra y fondo parecidos. El backend no lo
   impide (es la página de cada profesional); el editor del frontend muestra el contraste y avisa
   cuando no llega al mínimo recomendado (4,5:1).

**Consecuencias.** El tamaño del JSON está acotado por la validación (11 secciones × 5 campos). El
OpenAPI documenta `SectionStyleDto` y `ThemeSectionsDto`.
