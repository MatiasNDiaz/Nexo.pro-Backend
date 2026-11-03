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
  /** Confirmar por email la vinculación con Google (ADR 0015). */
  GOOGLE_LINK_REQUESTED: 'auth.google-link-requested',
  /** Inicio de sesión desde un dispositivo que la cuenta no usó antes (ADR 0031). */
  NEW_DEVICE_LOGIN: 'auth.new-device-login',
} as const;

export interface NewDeviceLoginEvent {
  email: string;
  firstName: string;
  userId: string;
  /** Familia de sesión (dispositivo) que se puede cerrar desde el email. */
  familyId: string;
  at: Date;
  userAgent: string | null;
  /** Ciudad aproximada: solo para el email, no se guarda. */
  approximateLocation: string | null;
}

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
