/**
 * Qué mostrar al cambiar de plan (ADR 0026). Recibe los elementos del más viejo al más nuevo:
 * - si hay más visibles que el límite, se ocultan los más recientes (los fijos, como la profesión
 *   principal, se quedan siempre);
 * - si sobra lugar (subió de plan), vuelven los ocultos por el plan, del más viejo al más nuevo.
 * Nada se borra.
 */
export function fitToLimit<T>(
  items: readonly T[],
  limit: number,
  isVisible: (item: T) => boolean,
  isPinned: (item: T) => boolean = () => false,
): { hide: T[]; show: T[] } {
  const visible = items.filter(isVisible);
  if (visible.length > limit) {
    const pinned = visible.filter(isPinned);
    const rest = visible.filter((item) => !isPinned(item));
    const keep = new Set([...pinned, ...rest.slice(0, Math.max(0, limit - pinned.length))]);
    return { hide: visible.filter((item) => !keep.has(item)), show: [] };
  }
  const hidden = items.filter((item) => !isVisible(item));
  return { hide: [], show: hidden.slice(0, limit - visible.length) };
}
