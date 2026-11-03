/** Se puede reseñar y editar hasta 30 días después de terminada la contratación (ADR 0028). */
export const REVIEW_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const reviewWindowEnd = (completedAt: Date): Date =>
  new Date(completedAt.getTime() + REVIEW_WINDOW_DAYS * DAY_MS);

/** Reseñas que cuentan y se muestran: visibles y no borradas por su autor. */
export const COUNTED_REVIEW = `r.status = 'VISIBLE' AND r.deleted_at IS NULL`;

/**
 * Promedio (un decimal) y cantidad de reseñas del usuario profesional `${userColumn}`, para
 * incluir en un SELECT. Se calcula al leer: nunca queda desfasado.
 */
export const ratingColumns = (userColumn: string) => `
  (SELECT round(avg(r.rating), 1) FROM reviews r
    WHERE r.professional_id = ${userColumn} AND ${COUNTED_REVIEW}) AS rating_average,
  (SELECT count(*) FROM reviews r
    WHERE r.professional_id = ${userColumn} AND ${COUNTED_REVIEW}) AS rating_count`;

/** Nombre público del autor: nombre e inicial del apellido (o la cuenta eliminada). */
export function displayName(user: {
  firstName: string;
  lastName: string;
  deletedAt: Date | null;
}): string {
  if (user.deletedAt) return 'Usuario eliminado';
  const initial = user.lastName.trim().charAt(0);
  return initial ? `${user.firstName} ${initial.toUpperCase()}.` : user.firstName;
}
