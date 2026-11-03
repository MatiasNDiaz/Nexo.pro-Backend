/** Contenido que publican los usuarios (reseñas y foro, ADR 0028): visible u oculto por el admin. */
export enum ContentStatus {
  VISIBLE = 'VISIBLE',
  HIDDEN_BY_ADMIN = 'HIDDEN_BY_ADMIN',
}

/** Check compartido: ocultar exige fecha y motivo. */
export const HIDDEN_CHECK =
  "status <> 'HIDDEN_BY_ADMIN' OR (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL)";
