/**
 * Eventos internos de autenticación. Se emiten DESPUÉS del commit (nunca dentro de la
 * transacción), así no se manda un email por algo que se revirtió. Viajan en memoria del proceso:
 * nunca se loguean (llevan tokens en claro).
 */
export const AuthEvents = {
  EMAIL_VERIFICATION_REQUESTED: 'auth.email-verification-requested',
  ALREADY_REGISTERED: 'auth.already-registered',
  PASSWORD_RESET_REQUESTED: 'auth.password-reset-requested',
  PASSWORD_CHANGED: 'auth.password-changed',
  ACCOUNT_DELETION_SCHEDULED: 'account.deletion-scheduled',
} as const;

export interface AccountDeletionScheduledEvent {
  email: string;
  firstName: string;
  deletionScheduledFor: Date;
}

export interface TokenMailEvent {
  email: string;
  firstName: string;
  token: string;
}

export interface UserMailEvent {
  email: string;
  firstName: string;
}

export interface AlreadyRegisteredEvent {
  email: string;
}
