/** Urgencia sugerida por el FI §11.1 (la semántica y sus consecuencias siguen pendientes). */
export enum RequestUrgency {
  CAN_WAIT = 'CAN_WAIT',
  IMPATIENT = 'IMPATIENT',
  URGENT = 'URGENT',
}

export enum RequestStatus {
  OPEN = 'OPEN',
  /** El cliente eligió a un profesional: hay contratación. */
  SELECTED = 'SELECTED',
  CANCELLED = 'CANCELLED',
}

/** Negociación con cada profesional (ADR 0025). */
export enum TargetStatus {
  PENDING = 'PENDING',
  IN_DISCUSSION = 'IN_DISCUSSION',
  QUOTED = 'QUOTED',
  SELECTED = 'SELECTED',
  NOT_SELECTED = 'NOT_SELECTED',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
}

export enum QuoteStatus {
  SENT = 'SENT',
  /** Reemplazado por una corrección. */
  SUPERSEDED = 'SUPERSEDED',
  WITHDRAWN = 'WITHDRAWN',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

/** Contratación (ADR 0025). */
export enum ContractStatus {
  ACCEPTED = 'ACCEPTED',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED_BY_CLIENT = 'CANCELLED_BY_CLIENT',
  CANCELLED_BY_PRO = 'CANCELLED_BY_PRO',
}
