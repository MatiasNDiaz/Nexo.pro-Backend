/** Reglas de nombres de barrios cargados por usuarios (ADR 0010). Funciones puras. */

export const NEIGHBORHOOD_NAME_MIN = 2;
export const NEIGHBORHOOD_NAME_MAX = 60;
/** Letras (con tildes), números, espacios, punto, guion y apóstrofo. */
export const NEIGHBORHOOD_NAME_PATTERN = /^[\p{L}\p{N} .'-]+$/u;

/** Palabras que quedan en minúscula en el nombre que se muestra ("Cerro de las Rosas"). */
const LOWERCASE_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y']);

/**
 * Clave de comparación: sin tildes, minúsculas, cualquier otro signo como espacio, espacios
 * simples. "  Nueva  CÓRDOBA " y "nueva cordoba" dan lo mismo: `nueva cordoba`.
 */
export function normalizeNeighborhoodName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Nombre que se muestra: espacios prolijos y, si el usuario escribió todo en minúsculas o todo en
 * mayúsculas, mayúscula inicial por palabra. Si mezcló mayúsculas a propósito, se respeta.
 */
export function displayNeighborhoodName(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  const mixedCase = collapsed !== collapsed.toLowerCase() && collapsed !== collapsed.toUpperCase();
  if (mixedCase) return collapsed;
  return collapsed
    .toLowerCase()
    .split(' ')
    .map((word, index) =>
      index > 0 && LOWERCASE_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

/** Valida el texto ingresado. Devuelve el motivo del rechazo o null si es válido. */
export function neighborhoodNameProblem(raw: string): string | null {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed.length < NEIGHBORHOOD_NAME_MIN || collapsed.length > NEIGHBORHOOD_NAME_MAX) {
    return `El barrio debe tener entre ${NEIGHBORHOOD_NAME_MIN} y ${NEIGHBORHOOD_NAME_MAX} caracteres.`;
  }
  if (!NEIGHBORHOOD_NAME_PATTERN.test(collapsed)) {
    return 'El barrio solo puede tener letras, números, espacios, puntos, guiones y apóstrofos.';
  }
  if (normalizeNeighborhoodName(collapsed).length < NEIGHBORHOOD_NAME_MIN) {
    return 'El nombre del barrio no es válido.';
  }
  return null;
}
